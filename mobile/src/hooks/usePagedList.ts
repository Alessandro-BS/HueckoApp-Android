import type { Page } from '@hueckoapp/shared';
import { useCallback, useEffect, useState } from 'react';

import { useResource } from './useResource';

export type FetchPage<T> = (search: string, page: number) => Promise<Page<T>>;

// Lista paginada con búsqueda (Usuarios, Grupos, Registro). `fetchPage` debe ser estable (función de módulo).
// Buscar vuelve a la página 1; cambiar de página conserva la búsqueda. Cada cambio es una carga nueva de useResource.
export function usePagedList<T>(fetchPage: FetchPage<T>) {
  const [query, setQuery] = useState({ search: '', page: 1 });
  const load = useCallback(() => fetchPage(query.search, query.page), [fetchPage, query]);
  const { data, loaded, loading, refreshing, error, failedLoads, reload } = useResource(load);
  const pageCount = data ? Math.max(1, Math.ceil(data.total / data.pageSize)) : 1;

  // La página pedida se quedó vacía pero hay resultados (p. ej. se borró lo último de la última página al volver
  // del detalle): se salta a la última página que queda en vez de mostrar «Todavía no hay…».
  const strandedPage = data !== undefined && data.items.length === 0 && data.total > 0 && query.page > 1;
  useEffect(() => {
    if (strandedPage) setQuery((q) => ({ ...q, page: Math.min(q.page - 1, pageCount) }));
  }, [strandedPage, pageCount]);

  const applySearch = useCallback((text: string) => setQuery({ search: text.trim(), page: 1 }), []);
  const goTo = useCallback((page: number) => setQuery((q) => ({ ...q, page })), []);

  return {
    items: data?.items ?? [],
    total: data?.total ?? 0,
    page: query.page,
    pageCount,
    search: query.search,
    hasPrev: query.page > 1,
    hasNext: query.page < pageCount,
    applySearch,
    nextPage: () => goTo(query.page + 1),
    prevPage: () => goTo(Math.max(1, query.page - 1)),
    loaded, loading, refreshing, error, failedLoads, reload,
  };
}
