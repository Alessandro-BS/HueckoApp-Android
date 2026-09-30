import type { Dashboard, PlanSuggestion, Proposal, ProposalDraft, TimeWindow, User, VotingSummary } from '@hueckoapp/shared';

// Datos de prueba basados en la semilla (domain spec §3). Hoy, en los tests, es el martes 29/09/2026 a las 10:00.
export const TEST_USER: User = { id: 'u1', name: 'Usuario de Prueba', email: 'test@test.com' };
export const ANA: User = { id: 'u2', name: 'Ana', email: 'ana@test.com' };

export const makeWindow = (over: Partial<TimeWindow> = {}): TimeWindow => ({
  id: 'w_21', dayOfWeek: 2, startTime: '16:00', endTime: '18:00', availabilityPercentage: 100, voteCount: 0, ...over,
});

// prop_2: en votación, creada por Ana, cierra hoy a las 20:00; Ana votó el martes.
export const makeProposal = (over: Partial<Proposal> = {}): Proposal => ({
  id: 'prop_2',
  groupId: 'g1',
  title: 'Repaso antes de la entrega',
  location: { name: 'Google Meet', latitude: null, longitude: null },
  createdBy: ANA,
  votingDeadline: new Date(2026, 8, 29, 20, 0).toISOString(),
  state: 'PROPUESTO',
  windows: [
    makeWindow({ voteCount: 1 }),
    makeWindow({ id: 'w_22', dayOfWeek: 4, startTime: '10:00', endTime: '12:00' }),
    makeWindow({ id: 'w_23', dayOfWeek: 5, availabilityPercentage: 50 }),
  ],
  myVoteWindowId: null,
  // Por defecto gestiona quien creó el plan (en los tests, el usuario actual es TEST_USER); se puede forzar con `canManage`.
  canManage: (over.createdBy ?? ANA).id === TEST_USER.id,
  chosenWindowId: null,
  scheduledAt: null,
  scheduledDate: null,
  incidences: [],
  createdAt: new Date(2026, 8, 29, 9, 0).toISOString(),
  ...over,
});

// prop_1: confirmada por Usuario de Prueba para el miércoles 30 a las 11:00, con el imprevisto de Ana sin resolver.
export const makeConfirmed = (over: Partial<Proposal> = {}): Proposal =>
  makeProposal({
    id: 'prop_1',
    title: 'Reunión de avance del proyecto',
    location: { name: 'Biblioteca central', latitude: null, longitude: null },
    createdBy: TEST_USER,
    votingDeadline: new Date(2026, 8, 28, 10, 0).toISOString(),
    state: 'CONFIRMADO',
    windows: [makeWindow({ id: 'w_1', dayOfWeek: 3, startTime: '11:00', endTime: '13:00', voteCount: 2 })],
    myVoteWindowId: 'w_1',
    chosenWindowId: 'w_1',
    scheduledAt: new Date(2026, 8, 30, 11, 0).toISOString(),
    scheduledDate: '2026-09-30',
    incidences: [
      {
        id: 'inc_1', user: ANA, type: 'IMPREVISTO', reason: 'Cruce con un examen de laboratorio a última hora.',
        delayMinutes: null, criticality: 'MEDIA', resolved: false, createdAt: new Date(2026, 8, 29, 9, 0).toISOString(),
      },
    ],
    createdAt: new Date(2026, 8, 27, 10, 0).toISOString(),
    ...over,
  });

// GET /me/dashboard con la semilla, visto por Usuario de Prueba (domain spec §2.2).
export const makeDashboard = (over: Partial<Dashboard> = {}): Dashboard => ({
  metrics: { activeGroups: 1, openVotes: 1, matchingHours: 6, totalBlocks: 2 },
  nextPlan: {
    ...makeConfirmed(),
    groupName: 'Proyecto Integrador',
    attendees: [
      { user: TEST_USER, isEssential: false, status: 'PUNTUAL', delayMinutes: null },
      { user: ANA, isEssential: false, status: 'NO_ASISTE', delayMinutes: null },
    ],
  },
  groups: [
    { id: 'g1', name: 'Proyecto Integrador', memberCount: 2, nextWindow: { dayOfWeek: 3, startTime: '11:00', endTime: '13:00', availabilityPercentage: 100 } },
  ],
  pendingVotes: [{ ...makeProposal(), groupName: 'Proyecto Integrador' }],
  expressAlert: {
    proposalId: 'prop_1', planTitle: 'Reunión de avance del proyecto', groupName: 'Proyecto Integrador', who: 'Ana',
    reason: 'Cruce con un examen de laboratorio a última hora.', kind: 'AVISO', canResolve: true, createdBy: TEST_USER,
  },
  ...over,
});

// Respuestas de IA de ejemplo (la franja es un hueco real de la semilla).
export const makeDraft = (over: Partial<ProposalDraft> = {}): ProposalDraft => ({
  title: 'Estudiar para el parcial',
  category: 'ESTUDIO',
  placeName: 'Biblioteca central',
  window: { dayOfWeek: 2, startTime: '08:00', endTime: '20:00', availabilityPercentage: 100, freeMembers: 2 },
  votingDeadline: new Date(2026, 8, 30, 10, 0).toISOString(),
  ...over,
});

export const makeSuggestion = (over: Partial<PlanSuggestion> = {}): PlanSuggestion => ({
  title: 'Sesión de estudio antes del parcial',
  category: 'ESTUDIO',
  placeIdea: 'Biblioteca central',
  window: { dayOfWeek: 1, startTime: '12:00', endTime: '20:00', availabilityPercentage: 100, freeMembers: 2 },
  reason: 'Todo el grupo está libre el lunes por la tarde.',
  ...over,
});

export const makeSummary = (over: Partial<VotingSummary> = {}): VotingSummary => ({
  summary: 'Votó 1 de 2 integrantes: el jueves va ganando y no hay imprevistos.',
  recommendation: 'CONFIRMAR',
  reason: 'Hay una franja clara y nadie reportó problemas.',
  ...over,
});
