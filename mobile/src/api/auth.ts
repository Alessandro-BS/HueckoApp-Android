import type { AuthResponse, AuthResult, Challenge, CurrentUser, VerifyChallengeInput } from '@hueckoapp/shared';

import { api } from './client';

export type { AuthResponse, AuthResult };

export const isChallenge = (r: AuthResult): r is { challenge: Challenge } => 'challenge' in r;

export const loginRequest = async (email: string, password: string) =>
  (await api.post<AuthResult>('/auth/login', { email, password })).data;

export const registerRequest = async (name: string, email: string, password: string) =>
  (await api.post<AuthResult>('/auth/register', { name, email, password })).data;

/** Confirma el código del correo. 200 con la sesión; 204 (p. ej. activar el 2FA) devuelve null. */
export const verifyChallengeRequest = async (id: string, code: string, newPassword?: string): Promise<AuthResponse | null> => {
  const body: VerifyChallengeInput = newPassword === undefined ? { code } : { code, newPassword };
  const res = await api.post<AuthResponse | undefined>(`/auth/challenges/${encodeURIComponent(id)}/verify`, body);
  return res.status === 204 || !res.data ? null : res.data;
};

export const resendChallengeRequest = async (id: string) => {
  await api.post(`/auth/challenges/${encodeURIComponent(id)}/resend`);
};

export const forgotPasswordRequest = async (email: string) =>
  (await api.post<{ challenge: Challenge }>('/auth/password/forgot', { email })).data;

export const meRequest = async () => (await api.get<CurrentUser>('/auth/me')).data;
