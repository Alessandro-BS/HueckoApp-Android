import type { AuthResponse, CurrentUser } from '@hueckoapp/shared';

import { api } from './client';

export type { AuthResponse };

export const loginRequest = async (email: string, password: string) =>
  (await api.post<AuthResponse>('/auth/login', { email, password })).data;

export const registerRequest = async (name: string, email: string, password: string) =>
  (await api.post<AuthResponse>('/auth/register', { name, email, password })).data;

export const meRequest = async () => (await api.get<CurrentUser>('/auth/me')).data;
