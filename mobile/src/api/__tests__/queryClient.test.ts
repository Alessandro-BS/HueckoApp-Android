import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { renderHook, waitFor } from '@testing-library/react-native';
import { createElement, type ReactNode } from 'react';

import { useApiQuery } from '../../hooks/useApiQuery';
import { ApiError } from '../client';
import { retryDelay, shouldRetry } from '../queryClient';

const network = new ApiError(0, 'NETWORK_ERROR', 'No se pudo conectar con el servidor. Revisa tu conexión.');
const timeout = new ApiError(0, 'TIMEOUT', 'El servidor tardó demasiado en responder. Inténtalo de nuevo.');

describe('shouldRetry', () => {
  it('reintenta sin respuesta (sin red o Render dormido) y con 5xx, hasta 3 veces', () => {
    expect(shouldRetry(0, timeout)).toBe(true);
    expect(shouldRetry(2, network)).toBe(true);
    expect(shouldRetry(0, new ApiError(503, 'UNKNOWN', 'Servicio no disponible'))).toBe(true);
    expect(shouldRetry(3, network)).toBe(false);
  });

  it('no reintenta un 4xx ni un error que no sea de la API', () => {
    expect(shouldRetry(0, new ApiError(404, 'NOT_FOUND', 'No existe'))).toBe(false);
    expect(shouldRetry(0, new ApiError(401, 'UNAUTHORIZED', 'Sesión vencida'))).toBe(false);
    expect(shouldRetry(0, new Error('bug'))).toBe(false);
  });
});

it('retryDelay espera 2 s, 4 s, 8 s… sin pasar de 15 s', () => {
  expect([0, 1, 2, 5].map(retryDelay)).toEqual([2000, 4000, 8000, 15000]);
});

it('useApiQuery se recupera solo si el servidor tarda en despertar', async () => {
  const client = new QueryClient({ defaultOptions: { queries: { retry: shouldRetry, retryDelay: 0, gcTime: Infinity } } });
  const wrapper = ({ children }: { children: ReactNode }) => createElement(QueryClientProvider, { client }, children);
  const load = jest.fn().mockRejectedValueOnce(timeout).mockRejectedValueOnce(timeout).mockResolvedValue(['ok']);

  const { result } = await renderHook(() => useApiQuery(['prueba'], load), { wrapper });
  expect(result.current.loading).toBe(true);
  await waitFor(() => expect(result.current.data).toEqual(['ok']));
  expect(load).toHaveBeenCalledTimes(3);
  expect(result.current.error).toBeNull();
});
