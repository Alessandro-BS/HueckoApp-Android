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
let onUnauthorized: (() => void) | null = null;

export const setAuthToken = (token: string | null) => {
  authToken = token;
};
export const setUnauthorizedHandler = (fn: (() => void) | null) => {
  onUnauthorized = fn;
};

api.interceptors.request.use((config) => {
  if (authToken) config.headers.Authorization = `Bearer ${authToken}`;
  return config;
});

type ErrorBody = { error?: { code?: string; message?: string; details?: unknown } };

api.interceptors.response.use(
  (response) => response,
  (error: AxiosError<ErrorBody>) => {
    if (!error.response) {
      throw new ApiError(0, 'NETWORK_ERROR', 'No se pudo conectar con el servidor. Revisa tu conexión.');
    }
    const { status, data } = error.response;
    // Un 401 con sesión abierta significa token vencido: cerrar sesión. Solo si la
    // petición salió con el token actual; un 401 tardío de una sesión anterior se ignora.
    if (status === 401 && authToken && error.config?.headers?.Authorization === `Bearer ${authToken}`) {
      onUnauthorized?.();
    }
    throw new ApiError(
      status,
      data?.error?.code ?? 'UNKNOWN',
      data?.error?.message ?? 'Ocurrió un error inesperado.',
      data?.error?.details ?? null,
    );
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
