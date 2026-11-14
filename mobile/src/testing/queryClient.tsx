import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import type { ReactNode } from 'react';

import { shouldRetry } from '../api/queryClient';

// Un QueryClient nuevo por test (sin caché compartida entre tests) y sin reintentos: un fallo se ve al instante.
// Con `{ retries: true }` reintenta como la app (shouldRetry), pero sin esperar entre intentos.
// Uso: render(<Pantalla />, withQueryClient()) o renderHook(() => useAlgo(), withQueryClient()).
export function withQueryClient({ retries = false }: { retries?: boolean } = {}) {
  const client = new QueryClient({
    defaultOptions: {
      queries: { retry: retries ? shouldRetry : false, retryDelay: 0, gcTime: Infinity },
      mutations: { retry: false },
    },
  });
  const wrapper = ({ children }: { children: ReactNode }) => <QueryClientProvider client={client}>{children}</QueryClientProvider>;
  return { wrapper, client };
}
