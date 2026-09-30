import { listAdminGroups, listAdminUsers, listAudit } from '../api/admin';
import { usePagedList } from './usePagedList';

// El registro no tiene búsqueda: solo páginas.
const fetchAudit = (_search: string, page: number) => listAudit(page);

export const useAdminUsers = () => usePagedList(listAdminUsers);
export const useAdminGroups = () => usePagedList(listAdminGroups);
export const useAdminAudit = () => usePagedList(fetchAudit);
