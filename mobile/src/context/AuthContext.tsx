import type { CurrentUser } from '@hueckoapp/shared';
import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from 'react';
import { AppState } from 'react-native';

import { loginRequest, meRequest, registerRequest, type AuthResponse } from '../api/auth';
import { ApiError, setAuthToken, setNotAdminHandler, setUnauthorizedHandler } from '../api/client';
import { tokenStorage } from '../auth/tokenStorage';
import { showToast } from '../utils/toast';

type Status = 'loading' | 'signedOut' | 'signedIn';

type AuthContextValue = {
  status: Status;
  user: CurrentUser | null;
  login: (email: string, password: string) => Promise<void>;
  register: (name: string, email: string, password: string) => Promise<void>;
  logout: () => Promise<void>;
};

const AuthContext = createContext<AuthContextValue | null>(null);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [status, setStatus] = useState<Status>('loading');
  const [user, setUser] = useState<CurrentUser | null>(null);

  const logout = useCallback(async () => {
    setAuthToken(null);
    setUser(null);
    setStatus('signedOut');
    await tokenStorage.clear();
  }, []);

  const startSession = useCallback(async ({ token, user }: AuthResponse) => {
    await tokenStorage.set(token);
    setAuthToken(token);
    setUser(user);
    setStatus('signedIn');
  }, []);

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
        }
      } catch (e) {
        if (cancelled) return;
        // Token vencido o cuenta suspendida: la sesión guardada ya no sirve.
        if (e instanceof ApiError && (e.status === 401 || e.code === 'ACCOUNT_SUSPENDED')) {
          await logout();
        } else {
          // Sin red o error del servidor: conservar el token para reintentar en el próximo arranque.
          setAuthToken(null);
          setStatus('signedOut');
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
    const refresh = () => void meRequest().then((me) => !closed && setUser(me), () => undefined);
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
      login: async (email, password) => startSession(await loginRequest(email.trim(), password)),
      register: async (name, email, password) =>
        startSession(await registerRequest(name.trim(), email.trim(), password)),
      logout,
    }),
    [status, user, startSession, logout],
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth(): AuthContextValue {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth debe usarse dentro de <AuthProvider>');
  return ctx;
}
