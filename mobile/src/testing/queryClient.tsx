import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import type { ReactNode } from 'react';

// Un QueryClient nuevo por test (sin caché compartida entre tests) y sin reintentos: un fallo se ve al instante.
// Uso: render(<Pantalla />, withQueryClient()) o renderHook(() => useAlgo(), withQueryClient()).
export function withQueryClient() {
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false, gcTime: Infinity }, mutations: { retry: false } },
  });
  const wrapper = ({ children }: { children: ReactNode }) => <QueryClientProvider client={client}>{children}</QueryClientProvider>;
  return { wrapper, client };
}
