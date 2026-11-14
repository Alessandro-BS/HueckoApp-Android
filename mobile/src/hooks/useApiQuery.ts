import { useQuery, useQueryClient, type QueryKey } from '@tanstack/react-query';
import { useCallback } from 'react';

import { errorMessage } from '../api/client';
import type { Resource } from './useResource';

// LEER del servidor con TanStack Query, con la misma forma que useResource: las pantallas no cambian.
// La caché es por `key`: al volver a una pantalla se pinta lo último que se cargó mientras llega lo nuevo,
// y un cambio de `key` (otro grupo, otro usuario) nunca muestra los datos del anterior.
export function useApiQuery<T>(key: QueryKey, load: () => Promise<T>): Resource<T> {
  const queryClient = useQueryClient();
  const query = useQuery({ queryKey: key, queryFn: load });
  const { data, isFetching, refetch } = query;
  const hasData = data !== undefined;

  const reload = useCallback(async () => {
    await refetch();
  }, [refetch]);

  // Cambia la caché sin ir al servidor (tras crear o borrar algo). Cancela la carga en curso de esa clave:
  // traería el estado de antes del cambio.
  const keyHash = JSON.stringify(key);
  const mutate = useCallback(
    (update: (prev: T | undefined) => T | undefined) => {
      const queryKey = JSON.parse(keyHash) as QueryKey;
      void queryClient.cancelQueries({ queryKey, exact: true });
      queryClient.setQueryData<T>(queryKey, update);
    },
    [queryClient, keyHash],
  );

  return {
    data,
    loaded: hasData,
    error: query.error ? errorMessage(query.error) : null,
    failedLoads: query.errorUpdateCount,
    // Primera carga (o reintento tras un fallo) sin datos en pantalla; con datos, es una recarga.
    loading: !hasData && (isFetching || query.isPending),
    refreshing: hasData && isFetching,
    reload,
    mutate,
  };
}
