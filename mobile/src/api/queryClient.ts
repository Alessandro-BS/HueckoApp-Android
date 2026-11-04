import { focusManager, QueryClient } from '@tanstack/react-query';
import { AppState, type AppStateStatus } from 'react-native';

import { ApiError } from './client';

// TanStack Query hace en la app lo que Volley en Android: cola de peticiones, caché en memoria y reintentos.

const MAX_RETRIES = 3;

// Solo se reintenta lo que puede arreglarse solo: sin respuesta (sin red, o Render dormido, que tarda ~1 min en
// despertar y agota el timeout de 15 s) o un 5xx. Un 4xx (sin permiso, no existe, validación) se repetiría igual.
export const shouldRetry = (failureCount: number, error: unknown) =>
  failureCount < MAX_RETRIES && error instanceof ApiError && (error.status === 0 || error.status >= 500);

// 2 s, 4 s, 8 s: con los 15 s de cada intento, cubre ~75 s, lo que tarda en despertar el plan gratuito de Render.
export const retryDelay = (attempt: number) => Math.min(2000 * 2 ** attempt, 15000);

export const createQueryClient = () =>
  new QueryClient({
    defaultOptions: {
      queries: { retry: shouldRetry, retryDelay },
      // Crear, votar, unirse… no se repiten solos: el servidor podría haberlo hecho y la segunda vez fallaría o duplicaría.
      mutations: { retry: false },
    },
  });

// El de la app. AuthContext lo vacía al cerrar o abrir sesión para no mostrar datos de otra cuenta.
export const queryClient = createQueryClient();

export const queryKeys = {
  dashboard: (userId: string | undefined) => ['dashboard', userId ?? null] as const,
  groups: ['groups', 'list'] as const,
  group: (groupId: string) => ['groups', 'detail', groupId] as const,
};

// En React Native no hay «foco de ventana»: al volver la app a primer plano, las consultas viejas se recargan.
export function setupQueryFocus() {
  const subscription = AppState.addEventListener('change', (status: AppStateStatus) => {
    focusManager.setFocused(status === 'active');
  });
  return () => subscription.remove();
}
