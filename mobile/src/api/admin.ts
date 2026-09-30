import type {
  AdminGroupDetail, AdminGroupSummary, AdminProposalSummary, AdminReport, AdminStats, AdminUserDetail, AdminUserSummary, AuditEntry,
  Page, PopularHours, StatsBucket, Timeseries, UserRole, UserStatus,
} from '@hueckoapp/shared';

import { api } from './client';

// Periodo en días de calendario «YYYY-MM-DD», ambos incluidos (los del teléfono). El servidor los convierte en
// las medianoches de su zona horaria y agrupa por días y horas en ella (docs/api.md): la zona del teléfono no influye.
export type DateRange = { from: string; to: string };

const rangeParams = ({ from, to }: DateRange) => ({ from, to });
const userPath = (id: string) => `/admin/users/${encodeURIComponent(id)}`;
const groupPath = (id: string) => `/admin/groups/${encodeURIComponent(id)}`;

export const getAdminStats = async () => (await api.get<AdminStats>('/admin/stats')).data;

export const getTimeseries = async (range: DateRange, bucket: StatsBucket) =>
  (await api.get<Timeseries>('/admin/stats/timeseries', { params: { ...rangeParams(range), bucket } })).data;

export const getPopularHours = async (range?: DateRange) =>
  (await api.get<PopularHours>('/admin/stats/popular-hours', { params: range ? rangeParams(range) : undefined })).data;

export const getReport = async (range: DateRange) => (await api.get<AdminReport>('/admin/reports', { params: rangeParams(range) })).data;

export const listAdminUsers = async (search: string, page: number) =>
  (await api.get<Page<AdminUserSummary>>('/admin/users', { params: { search, page } })).data;

export const getAdminUser = async (id: string) => (await api.get<AdminUserDetail>(userPath(id))).data;

export const setUserStatus = async (id: string, status: UserStatus) =>
  (await api.patch<AdminUserDetail>(`${userPath(id)}/status`, { status })).data;

export const setUserRole = async (id: string, role: UserRole) => (await api.patch<AdminUserDetail>(`${userPath(id)}/role`, { role })).data;

export const listAdminGroups = async (search: string, page: number) =>
  (await api.get<Page<AdminGroupSummary>>('/admin/groups', { params: { search, page } })).data;

export const getAdminGroup = async (id: string) => (await api.get<AdminGroupDetail>(groupPath(id))).data;

export const deleteAdminGroup = async (id: string): Promise<void> => {
  await api.delete(groupPath(id));
};

// Moderación: el motivo (opcional) queda en el registro de acciones.
export const cancelProposalAsAdmin = async (id: string, reason?: string) =>
  (await api.post<AdminProposalSummary>(`/admin/proposals/${encodeURIComponent(id)}/cancel`, reason ? { reason } : {})).data;

export const listAudit = async (page: number) => (await api.get<Page<AuditEntry>>('/admin/audit', { params: { page } })).data;
