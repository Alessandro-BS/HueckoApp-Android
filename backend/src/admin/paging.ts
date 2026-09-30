import type { Page } from '@hueckoapp/shared';

// Listas de administración: 20 por página; la primera es la 1 (D10).
export const ADMIN_PAGE_SIZE = 20;

export const offsetOf = (page: number) => (page - 1) * ADMIN_PAGE_SIZE;

// Texto buscado → patrón para `LIKE ? ESCAPE '\'`: «100%» busca literalmente «100%», no «100 y lo que sea».
export const likePattern = (search: string) => `%${search.replace(/[\\%_]/g, (c) => `\\${c}`)}%`;

export const toPage = <T>(items: T[], page: number, total: number): Page<T> => ({ items, page, pageSize: ADMIN_PAGE_SIZE, total });
