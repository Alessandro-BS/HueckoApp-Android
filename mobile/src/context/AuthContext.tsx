import type { Challenge, CurrentUser } from '@hueckoapp/shared';
import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from 'react';
import { AppState } from 'react-native';

import { googleRequest, loginRequest, meRequest, registerRequest, verifyChallengeRequest, type AuthResponse, type AuthResult } from '../api/auth';
import { ApiError, setAuthToken, setNotAdminHandler, setUnauthorizedHandler } from '../api/client';
import { queryClient } from '../api/queryClient';
import { getGoogleIdToken, signOutGoogle } from '../auth/googleSignIn';
import { tokenStorage } from '../auth/tokenStorage';
import { registerDevice, unregisterDevice } from '../notifications/registration';
import { dashboardCache, lastEmailStorage, notificationsPreference, pushTokenStorage, sessionUserStorage } from '../storage/appStorage';
import { showToast } from '../utils/toast';

type Status = 'loading' | 'signedOut' | 'signedIn';

type AuthContextValue = {
  status: Status;
  user: CurrentUser | null;
  /** Devuelve el reto si hay que escribir un código antes de entrar; null si ya hay sesión. */
  login: (email: string, password: string) => Promise<Challenge | null>;
  register: (name: string, email: string, password: string) => Promise<Challenge | null>;
  /** Confirma el código del correo e inicia la sesión con la respuesta. */
  completeChallenge: (id: string, code: string, newPassword?: string) => Promise<void>;
  /** Entra con Google. false si la persona canceló (sin error visible); lanza si algo falla. */
  loginWithGoogle: () => Promise<boolean>;
  /** Vuelve a pedir el usuario al servidor (p. ej. tras activar o desactivar el 2FA). */
  refreshUser: () => Promise<void>;
  logout: () => Promise<void>;
};

// Registra el celular para los avisos si la persona no los apagó en Perfil (la preferencia es del celular).
const registerIfEnabled = async () => {
  if (await notificationsPreference.get()) {
    await registerDevice();
  } else if (await pushTokenStorage.get()) {
    // Se apagó con el interruptor pero el servidor no alcanzó a borrar el token: se reintenta.
    await unregisterDevice();
  }
};

const AuthContext = createContext<AuthContextValue | null>(null);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [status, setStatus] = useState<Status>('loading');
  const [user, setUser] = useState<CurrentUser | null>(null);

  const logout = useCallback(async () => {
    // Antes de soltar el JWT: el DELETE lo necesita. Si la sesión ya venció (401), falla y se ignora.
    await unregisterDevice({ forgetAlways: true }).catch(() => undefined);
    setAuthToken(null);
    setUser(null);
    setStatus('signedOut');
    void signOutGoogle(); // sin esperar: nunca bloquea el cierre de sesión
    queryClient.clear(); // la caché de TanStack Query es de esta cuenta
    await Promise.all([tokenStorage.clear(), sessionUserStorage.clear(), dashboardCache.clearAll(), pushTokenStorage.clear()]);
  }, []);

  const startSession = useCallback(async ({ token, user }: AuthResponse) => {
    await Promise.all([tokenStorage.set(token), lastEmailStorage.set(user.email), sessionUserStorage.set(user)]);
    queryClient.clear();
    setAuthToken(token);
    setUser(user);
    setStatus('signedIn');
    void registerIfEnabled();
  }, []);

  // Una respuesta con reto no trae token: no se inicia sesión hasta confirmar el código.
  const startOrChallenge = useCallback(
    async (result: AuthResult): Promise<Challenge | null> => {
      if ('challenge' in result) return result.challenge;
      await startSession(result);
      return null;
    },
    [startSession],
  );

  // Al abrir la app: si hay token guardado, comprobar que siga siendo válido.
  useEffect(() => {
    let cancelled = false;
    (async () => {
      const token = await tokenStorage.get();
      if (!token) {
        if (!cancelled) setStatus('signedOut');
        return;
      }
      setAuthToken(token);
      try {
        const me = await meRequest();
        if (!cancelled) {
          setUser(me);
          setStatus('signedIn');
          void sessionUserStorage.set(me);
          void registerIfEnabled();
        }
      } catch (e) {
        if (cancelled) return;
        // Token vencido o cuenta suspendida: la sesión guardada ya no sirve.
        if (e instanceof ApiError && (e.status === 401 || e.code === 'ACCOUNT_SUSPENDED')) {
          await logout();
        } else {
          // Sin red o error del servidor: se entra con el perfil guardado (Inicio muestra su copia con el aviso
          // «Sin conexión»). Cuando vuelva la red, cualquier 401 o cuenta suspendida cierra la sesión (interceptor).
          // Sin perfil guardado (sesión de una versión anterior) se conserva el token para el próximo arranque.
          const saved = await sessionUserStorage.get();
          if (cancelled) return;
          if (saved) {
            setUser(saved);
            setStatus('signedIn');
          } else {
            setAuthToken(null);
            setStatus('signedOut');
          }
        }
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [logout]);

  useEffect(() => {
    setUnauthorizedHandler((reason, message) => {
      // Suspendida: se explica por qué se cierra la sesión (con un token vencido basta volver al login).
      if (reason === 'ACCOUNT_SUSPENDED') showToast(message);
      void logout();
    });
    return () => setUnauthorizedHandler(null);
  }, [logout]);

  // Se refresca el rol al volver a primer plano (un cambio de la administración se ve sin reabrir la app) y cuando
  // el servidor responde 403 NOT_ADMIN (a esta cuenta le quitaron el rol: fuera el menú y las pantallas de admin).
  // Un 401 o una cuenta suspendida ya los trata el interceptor (aviso y cierre de sesión); otros fallos se ignoran.
  useEffect(() => {
    if (status !== 'signedIn') return;
    let closed = false;
    const refresh = () =>
      void meRequest().then(
        (me) => {
          if (closed) return;
          setUser(me);
          void sessionUserStorage.set(me);
        },
        () => undefined,
      );
    const subscription = AppState.addEventListener('change', (state) => {
      if (state === 'active') refresh();
    });
    setNotAdminHandler(refresh);
    return () => {
      closed = true;
      subscription.remove();
      setNotAdminHandler(null);
    };
  }, [status]);

  const value = useMemo<AuthContextValue>(
    () => ({
      status,
      user,
      login: async (email, password) => startOrChallenge(await loginRequest(email.trim(), password)),
      register: async (name, email, password) =>
        startOrChallenge(await registerRequest(name.trim(), email.trim(), password)),
      completeChallenge: async (id, code, newPassword) => {
        const session = await verifyChallengeRequest(id, code, newPassword);
        if (session) await startSession(session);
      },
      loginWithGoogle: async () => {
        const idToken = await getGoogleIdToken();
        if (!idToken) return false;
        await startSession(await googleRequest(idToken));
        return true;
      },
      refreshUser: async () => {
        const me = await meRequest();
        setUser(me);
        await sessionUserStorage.set(me);
      },
      logout,
    }),
    [status, user, startSession, startOrChallenge, logout],
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth(): AuthContextValue {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth debe usarse dentro de <AuthProvider>');
  return ctx;
}
