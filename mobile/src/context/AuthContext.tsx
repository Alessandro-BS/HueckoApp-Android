import type { User } from '@hueckoapp/shared';
import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from 'react';

import { loginRequest, meRequest, registerRequest, type AuthResponse } from '../api/auth';
import { setAuthToken, setUnauthorizedHandler } from '../api/client';
import { tokenStorage } from '../auth/tokenStorage';

type Status = 'loading' | 'signedOut' | 'signedIn';

type AuthContextValue = {
  status: Status;
  user: User | null;
  login: (email: string, password: string) => Promise<void>;
  register: (name: string, email: string, password: string) => Promise<void>;
  logout: () => Promise<void>;
};

const AuthContext = createContext<AuthContextValue | null>(null);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [status, setStatus] = useState<Status>('loading');
  const [user, setUser] = useState<User | null>(null);

  const logout = useCallback(async () => {
    setAuthToken(null);
    await tokenStorage.clear();
    setUser(null);
    setStatus('signedOut');
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
      } catch {
        if (!cancelled) await logout();
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [logout]);

  useEffect(() => {
    setUnauthorizedHandler(() => void logout());
    return () => setUnauthorizedHandler(null);
  }, [logout]);

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
