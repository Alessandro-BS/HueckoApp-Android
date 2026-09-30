import type {
  AdminGroupDetail, AdminGroupSummary, AdminProposalSummary, AdminReport, AdminStats, AdminUserDetail, AdminUserSummary, AiUsage,
  AuditEntry, HourCount, Page, PopularHours, Timeseries, User,
} from '@hueckoapp/shared';

import { ANA, TEST_USER } from './fixtures';

// Datos de administración basados en la semilla. Hoy, en los tests, es el martes 29/09/2026 a las 10:00.
export const ADMIN_USER: User = { id: 'u9', name: 'Administración HueckoApp', email: 'admin@test.com' };

export const page = <T>(items: T[], over: Partial<Page<T>> = {}): Page<T> => ({ items, page: 1, pageSize: 20, total: items.length, ...over });

export const makeUserSummary = (over: Partial<AdminUserSummary> = {}): AdminUserSummary => ({
  ...ANA, role: 'USER', status: 'ACTIVE', createdAt: '2026-09-20T15:00:00.000Z', groupCount: 1, ...over,
});

export const makeUserDetail = (over: Partial<AdminUserDetail> = {}): AdminUserDetail => ({
  ...makeUserSummary(),
  groups: [{ id: 'g1', name: 'Proyecto Integrador', role: 'MEMBER' }],
  activity: { proposalsCreated: 1, votes: 2, incidences: 1, timeBlocks: 3, aiCalls: 4 },
  ...over,
});

export const makeAdminProposal = (over: Partial<AdminProposalSummary> = {}): AdminProposalSummary => ({
  id: 'prop_2', title: 'Repaso antes de la entrega', state: 'PROPUESTO', createdBy: ANA, createdAt: '2026-09-29T14:00:00.000Z',
  votingDeadline: '2026-09-30T01:00:00.000Z', scheduledAt: null, scheduledDate: null, voteCount: 1, incidenceCount: 0, ...over,
});

export const makeGroupSummary = (over: Partial<AdminGroupSummary> = {}): AdminGroupSummary => ({
  id: 'g1', name: 'Proyecto Integrador', description: 'Entrega final', memberCount: 2, proposalCount: 1, owner: TEST_USER,
  createdAt: '2026-09-01T15:00:00.000Z', ...over,
});

export const makeGroupDetail = (over: Partial<AdminGroupDetail> = {}): AdminGroupDetail => ({
  ...makeGroupSummary(),
  inviteCode: 'PROY2026',
  availabilityThreshold: 80,
  members: [{ ...TEST_USER, role: 'OWNER', isEssential: false }, { ...ANA, role: 'MEMBER', isEssential: true }],
  proposals: [makeAdminProposal()],
  ...over,
});

export const makeAiUsage = (): AiUsage => ({
  calls: 4,
  ok: 3,
  successRate: 75,
  byTask: [
    { task: 'schedule-ocr', calls: 3, ok: 2, successRate: 67, avgDurationMs: 2100 },
    { task: 'proposal-draft', calls: 1, ok: 1, successRate: 100, avgDurationMs: 900 },
    { task: 'plan-suggestions', calls: 0, ok: 0, successRate: null, avgDurationMs: null },
    { task: 'voting-summary', calls: 0, ok: 0, successRate: null, avgDurationMs: null },
  ],
});

export const makeHours = (counts: Record<number, number> = { 11: 2, 20: 1 }): HourCount[] =>
  Array.from({ length: 24 }, (_, hour) => ({ hour, count: counts[hour] ?? 0 }));

export const makeStats = (over: Partial<AdminStats> = {}): AdminStats => ({
  users: { total: 4, active: 3, suspended: 1, admins: 1 },
  groups: 2,
  proposals: { PROPUESTO: 1, CONFIRMADO: 1, EN_RECOORDINACION: 0, CANCELADO: 1 },
  confirmedPlans: 1,
  incidences: 1,
  ai: makeAiUsage(),
  ...over,
});

// from/to: los días pedidos (claves «YYYY-MM-DD», ambos incluidos), tal cual los devuelve el servidor.
export const makeTimeseries = (over: Partial<Timeseries> = {}): Timeseries => ({
  from: '2026-07-13',
  to: '2026-09-29',
  bucket: 'week',
  points: [
    { start: '2026-09-21', registrations: 2, groupsCreated: 1, proposalsCreated: 0, aiCalls: 1 },
    { start: '2026-09-28', registrations: 1, groupsCreated: 0, proposalsCreated: 2, aiCalls: 3 },
  ],
  ...over,
});

export const makePopularHours = (counts?: Record<number, number>): PopularHours => ({ from: null, to: null, hours: makeHours(counts) });

export const makeReport = (over: Partial<AdminReport> = {}): AdminReport => ({
  period: { from: '2026-08-31T05:00:00.000Z', to: '2026-09-30T05:00:00.000Z', fromDate: '2026-08-31', toDate: '2026-09-29' },
  generatedAt: '2026-09-29T15:00:00.000Z',
  bucket: 'day',
  summary: { newUsers: 3, newGroups: 1, newProposals: 2, confirmedPlans: 1, incidences: 1, aiCalls: 4 },
  proposalsByState: { PROPUESTO: 1, CONFIRMADO: 1, EN_RECOORDINACION: 0, CANCELADO: 0 },
  ai: makeAiUsage(),
  timeseries: [
    { start: '2026-09-28', registrations: 2, groupsCreated: 1, proposalsCreated: 1, aiCalls: 3 },
    { start: '2026-09-29', registrations: 1, groupsCreated: 0, proposalsCreated: 1, aiCalls: 1 },
  ],
  popularHours: makeHours(),
  topGroups: [{ id: 'g1', name: 'Proyecto Integrador', proposals: 2 }],
  ...over,
});

export const makeAuditEntry = (over: Partial<AuditEntry> = {}): AuditEntry => ({
  id: 'a1', action: 'USER_SUSPENDED', admin: ADMIN_USER, targetType: 'USER', targetId: 'u2',
  details: { name: 'Ana', from: 'ACTIVE', to: 'SUSPENDED' }, createdAt: '2026-09-29T15:00:00.000Z', ...over,
});
