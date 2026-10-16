import axios, { AxiosError } from 'axios';

import { API_URL } from '../config';

export class ApiError extends Error {
  constructor(
    readonly status: number,
    readonly code: string,
    message: string,
    readonly details: unknown = null,
  ) {
    super(message);
  }
}

export const api = axios.create({ baseURL: API_URL, timeout: 15000 });

let authToken: string | null = null;
// Por qué se cierra la sesión: token vencido o inválido (401) o cuenta suspendida (403 ACCOUNT_SUSPENDED, D14).
export type SessionEndReason = 'UNAUTHORIZED' | 'ACCOUNT_SUSPENDED';

let onSessionEnd: ((reason: SessionEndReason, message: string) => void) | null = null;

export const setAuthToken = (token: string | null) => {
  authToken = token;
};
export const setUnauthorizedHandler = (fn: ((reason: SessionEndReason, message: string) => void) | null) => {
  onSessionEnd = fn;
};

// 403 NOT_ADMIN con el token vigente: a esta cuenta le quitaron el rol de administrador. No se cierra la sesión;
// AuthContext vuelve a pedir /auth/me y el menú y las pantallas de administración desaparecen (M3).
let onNotAdmin: (() => void) | null = null;
export const setNotAdminHandler = (fn: (() => void) | null) => {
  onNotAdmin = fn;
};

api.interceptors.request.use((config) => {
  if (authToken) config.headers.Authorization = `Bearer ${authToken}`;
  return config;
});

type ErrorBody = { error?: { code?: string; message?: string; details?: unknown } };

api.interceptors.response.use(
  (response) => response,
  (error: AxiosError<ErrorBody>) => {
    // Sin respuesta: o se agotó el tiempo de espera (la IA con una foto grande y mala red) o no hubo conexión.
    if (!error.response && (error.code === 'ECONNABORTED' || error.code === 'ETIMEDOUT')) {
      throw new ApiError(0, 'TIMEOUT', 'El servidor tardó demasiado en responder. Inténtalo de nuevo.');
    }
    if (!error.response) {
      throw new ApiError(0, 'NETWORK_ERROR', 'No se pudo conectar con el servidor. Revisa tu conexión.');
    }
    const { status, data } = error.response;
    const code = data?.error?.code ?? 'UNKNOWN';
    const message = data?.error?.message ?? 'Ocurrió un error inesperado.';
    // Solo si la petición salió con el token actual: un 401/403 tardío de una sesión anterior se ignora.
    const sentWithCurrentToken = Boolean(authToken) && error.config?.headers?.Authorization === `Bearer ${authToken}`;
    if (sentWithCurrentToken && status === 401) onSessionEnd?.('UNAUTHORIZED', message);
    if (sentWithCurrentToken && status === 403 && code === 'ACCOUNT_SUSPENDED') onSessionEnd?.('ACCOUNT_SUSPENDED', message);
    if (sentWithCurrentToken && status === 403 && code === 'NOT_ADMIN') onNotAdmin?.();
    throw new ApiError(status, code, message, data?.error?.details ?? null);
  },
);

export const errorMessage = (e: unknown) => {
  if (!(e instanceof ApiError)) return 'Ocurrió un error inesperado.';
  if (e.code === 'VALIDATION_ERROR' && Array.isArray(e.details) && e.details.length > 0) {
    const first: unknown = e.details[0];
    const message = (first as { message?: unknown } | null)?.message;
    if (typeof message === 'string') return message;
  }
  return e.message;
};
