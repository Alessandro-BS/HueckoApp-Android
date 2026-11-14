import type { ExpressVote, GroupMember, GroupSummary, Incidence, ProposalWithGroup, TimeWindow, User } from '@hueckoapp/shared';
import { describe, expect, it } from 'vitest';

import { addDays } from '../src/common/zone';
import { buildDashboard, matchingHours, upcomingPlans } from '../src/dashboard/dashboard';
import { NOW } from './helpers';

const test: User = { id: 'u-test', name: 'Usuario de Prueba', email: 'test@test.com' };
const ana: User = { id: 'u-ana', name: 'Ana', email: 'ana@test.com' };
const members: GroupMember[] = [
  { ...test, role: 'ORGANIZER', isEssential: false },
  { ...ana, role: 'MEMBER', isEssential: false },
];
const groups: GroupSummary[] = [{ id: 'g1', name: 'Proyecto Integrador', description: '', memberCount: 2, availabilityThreshold: 80 }];

// La fecha es la de ese día de la semana en la semana de NOW (lunes 28/09): aquí solo cuenta el día.
const win = (id: string, dayOfWeek: number, startTime: string, endTime: string, availabilityPercentage: number, voteCount: number): TimeWindow => ({
  id, date: addDays('2026-09-28', dayOfWeek - 1), dayOfWeek, startTime, endTime, availabilityPercentage, voteCount,
});
const incidence = (over: Partial<Incidence> = {}): Incidence => ({
  id: 'inc_1', user: ana, type: 'IMPREVISTO', reason: 'Cruce con un examen de laboratorio a última hora.',
  delayMinutes: null, criticality: 'MEDIA', resolved: false, criticalReason: null, createdAt: NOW.toISOString(), ...over,
});

// prop_1 y prop_2 con los porcentajes fijos de la semilla Kotlin (w_23 = 50 %, B15).
const prop1 = (over: Partial<ProposalWithGroup> = {}): ProposalWithGroup => ({
  id: 'prop_1', groupId: 'g1', groupName: 'Proyecto Integrador', title: 'Reunión de avance del proyecto',
  location: { name: 'Biblioteca central', latitude: null, longitude: null }, createdBy: test,
  votingDeadline: new Date(2026, 8, 28, 10, 0).toISOString(), state: 'CONFIRMADO',
  windows: [win('w_1', 3, '11:00', '13:00', 100, 2)], myVoteWindowId: 'w_1', canManage: true, chosenWindowId: 'w_1',
  scheduledAt: new Date(2026, 8, 30, 11, 0).toISOString(), scheduledDate: '2026-09-30', incidences: [incidence()], expressVote: null,
  createdAt: new Date(2026, 8, 27, 10, 0).toISOString(), ...over,
});
const prop2 = (over: Partial<ProposalWithGroup> = {}): ProposalWithGroup => ({
  id: 'prop_2', groupId: 'g1', groupName: 'Proyecto Integrador', title: 'Repaso antes de la entrega',
  location: { name: 'Google Meet', latitude: null, longitude: null }, createdBy: ana,
  votingDeadline: new Date(2026, 8, 29, 20, 0).toISOString(), state: 'PROPUESTO',
  windows: [win('w_21', 2, '16:00', '18:00', 100, 1), win('w_22', 4, '10:00', '12:00', 100, 0), win('w_23', 5, '16:00', '18:00', 50, 0)],
  myVoteWindowId: null, canManage: false, chosenWindowId: null, scheduledAt: null, scheduledDate: null, incidences: [], expressVote: null,
  createdAt: new Date(2026, 8, 29, 9, 0).toISOString(), ...over,
});

const build = (proposals: ProposalWithGroup[]) =>
  buildDashboard({ now: NOW, groups, proposals, totalBlocks: 2, membersOf: () => members });

describe('buildDashboard con la semilla (domain spec §2.2)', () => {
  it('valores esperados', () => {
    const d = build([prop1(), prop2()]);
    expect(d.metrics).toEqual({ activeGroups: 1, openVotes: 1, matchingHours: 6, totalBlocks: 2 });
    expect(d.nextPlan?.id).toBe('prop_1');
    expect(d.nextPlan?.groupName).toBe('Proyecto Integrador');
    expect(d.nextPlan?.attendees).toEqual([
      { user: test, isEssential: false, status: 'PUNTUAL', delayMinutes: null },
      { user: ana, isEssential: false, status: 'NO_ASISTE', delayMinutes: null },
    ]);
    // D6: el grupo muestra su propuesta más reciente (prop_2, creada después), no la más antigua.
    expect(d.groups).toEqual([
      { id: 'g1', name: 'Proyecto Integrador', memberCount: 2, nextWindow: { date: '2026-09-29', dayOfWeek: 2, startTime: '16:00', endTime: '18:00', availabilityPercentage: 100 } },
    ]);
    expect(d.pendingVotes.map((p) => p.id)).toEqual(['prop_2']);
    expect(d.expressAlert).toEqual({
      proposalId: 'prop_1', planTitle: 'Reunión de avance del proyecto', groupName: 'Proyecto Integrador',
      who: 'Ana', reason: 'Cruce con un examen de laboratorio a última hora.', kind: 'AVISO', canResolve: true, canVote: false, createdBy: test, expiresAt: null,
    });
  });

  it('tras REPROGRAMAR: 2 votaciones abiertas, sin próximo plan ni alerta', () => {
    const reprogramada = prop1({
      state: 'PROPUESTO', chosenWindowId: null, scheduledAt: null, scheduledDate: null, myVoteWindowId: null,
      windows: [win('w_1', 3, '11:00', '13:00', 100, 0)], incidences: [incidence({ resolved: true })],
      votingDeadline: new Date(2026, 9, 5, 20, 0).toISOString(),
    });
    const d = build([reprogramada, prop2()]);
    expect(d.metrics.openVotes).toBe(2);
    expect(d.nextPlan).toBeNull();
    expect(d.expressAlert).toBeNull();
    // Las que cierran antes, primero: prop_2 cierra hoy.
    expect(d.pendingVotes.map((p) => p.id)).toEqual(['prop_2', 'prop_1']);
  });

  it('tras CANCELAR: sin próximo plan ni alerta; el grupo sigue en w_21 (la más reciente); las horas bajan a 4 (las canceladas no cuentan)', () => {
    const d = build([prop1({ state: 'CANCELADO', incidences: [incidence({ resolved: true })] }), prop2()]);
    expect(d.nextPlan).toBeNull();
    expect(d.expressAlert).toBeNull();
    expect(d.groups[0].nextWindow).toEqual({ date: '2026-09-29', dayOfWeek: 2, startTime: '16:00', endTime: '18:00', availabilityPercentage: 100 });
    expect(d.metrics.matchingHours).toBe(4);
  });

  it('tras MANTENER: Ana vuelve a PUNTUAL y no hay alerta', () => {
    const d = build([prop1({ incidences: [incidence({ resolved: true })] }), prop2()]);
    expect(d.expressAlert).toBeNull();
    expect(d.nextPlan?.attendees.map((a) => a.status)).toEqual(['PUNTUAL', 'PUNTUAL']);
  });
});

describe('alerta exprés (G5)', () => {
  it('EN_RECOORDINACION tiene prioridad y usa la incidencia ALTA; canResolve es el canManage del plan', () => {
    const aviso = prop1();
    const recoordinacion = prop1({
      id: 'prop_3', title: 'Presentación', state: 'EN_RECOORDINACION', canManage: false,
      incidences: [
        incidence({ id: 'i1', type: 'TARDANZA', delayMinutes: 10, criticality: 'BAJA', reason: 'Tráfico' }),
        incidence({ id: 'i2', type: 'FALTA', criticality: 'ALTA', reason: 'Enferma' }),
      ],
    });
    expect(build([aviso, recoordinacion]).expressAlert).toMatchObject({ proposalId: 'prop_3', kind: 'RECOORDINACION', who: 'Ana', reason: 'Enferma', canResolve: false });
    // Control positivo: el mismo plan, gestionable por quien pregunta (p. ej. el ORGANIZER si quien lo creó se fue).
    expect(build([aviso, { ...recoordinacion, canManage: true }]).expressAlert?.canResolve).toBe(true);
  });

  const voto = (over: Partial<ExpressVote> = {}): ExpressVote => ({
    id: 'ev_1', status: 'ABIERTA', reportedBy: ana, reason: 'Me operan mañana.', criticalReason: 'Es imprescindible.',
    openedAt: NOW.toISOString(), expiresAt: new Date(2026, 8, 29, 12, 0).toISOString(), closedAt: null,
    counts: { CANCELAR: 0, REAGENDAR: 0, MANTENER: 0 }, myVote: null, canVote: true, eligibleVoters: 2, quorum: 1,
    result: null, resultByDefault: null, recommendation: null, ...over,
  });

  it('una votación exprés abierta es VOTACION, con quien reportó, su motivo y cuándo vence; gana a la recoordinación', () => {
    const conVoto = prop1({ id: 'prop_v', expressVote: voto(), incidences: [incidence({ criticality: 'ALTA', reason: 'otro texto' })] });
    const recoordinacion = prop1({ id: 'prop_r', state: 'EN_RECOORDINACION', incidences: [incidence()] });
    expect(build([recoordinacion, conVoto]).expressAlert).toEqual({
      proposalId: 'prop_v', planTitle: 'Reunión de avance del proyecto', groupName: 'Proyecto Integrador',
      who: 'Ana', reason: 'Me operan mañana.', kind: 'VOTACION', canResolve: true, canVote: true, createdBy: test,
      expiresAt: new Date(2026, 8, 29, 12, 0).toISOString(),
    });
    expect(build([conVoto]).expressAlert?.canResolve).toBe(true);
    expect(build([{ ...conVoto, canManage: false }]).expressAlert?.canResolve).toBe(false);
  });

  it('canVote de la alerta es el canVote de la votación abierta (false para quien avisó o no vota) y false fuera de VOTACION', () => {
    const conVoto = prop1({ id: 'prop_v', expressVote: voto({ canVote: false }) });
    expect(build([conVoto]).expressAlert).toMatchObject({ kind: 'VOTACION', canVote: false });
    // Una votación cerrada que dejó el plan en recoordinación: aunque su canVote fuera true, ya no se vota.
    const reagendado = prop1({ state: 'EN_RECOORDINACION', expressVote: voto({ status: 'CERRADA', result: 'REAGENDAR', canVote: true }) });
    expect(build([reagendado]).expressAlert).toMatchObject({ kind: 'RECOORDINACION', canVote: false });
  });

  it('una votación ya cerrada no es VOTACION', () => {
    const cerrada = prop1({ expressVote: voto({ status: 'CERRADA', result: 'MANTENER', closedAt: NOW.toISOString() }), incidences: [incidence({ resolved: true })] });
    expect(build([cerrada]).expressAlert).toBeNull();
  });

  it('el plan reagendado por la votación es RECOORDINACION (sin expiresAt)', () => {
    const reagendado = prop1({
      state: 'EN_RECOORDINACION', expressVote: voto({ status: 'CERRADA', result: 'REAGENDAR', closedAt: NOW.toISOString() }),
    });
    expect(build([reagendado]).expressAlert).toMatchObject({ kind: 'RECOORDINACION', who: 'Ana', expiresAt: null });
  });

  it('una ausencia no crítica sigue siendo AVISO, sin expiresAt', () => {
    expect(build([prop1()]).expressAlert).toMatchObject({ kind: 'AVISO', expiresAt: null });
  });

  it('un plan que ya ocurrió no es el próximo ni dispara la alerta', () => {
    const pasado = prop1({ scheduledAt: new Date(2026, 8, 28, 11, 0).toISOString() });
    const d = build([pasado]);
    expect(d.nextPlan).toBeNull();
    expect(d.expressAlert).toBeNull();
  });

  it('un plan EN_RECOORDINACION con la fecha vieja ya pasada sigue siendo RECOORDINACION (hay que sacarlo replanteando)', () => {
    // Planes que la regla vieja dejó en recoordinación conservaron su scheduledAt; si ya pasó, siguen atascados.
    const ayer = new Date(2026, 8, 27, 11, 0).toISOString();
    const sinVoto = prop1({ state: 'EN_RECOORDINACION', scheduledAt: ayer, incidences: [incidence({ criticality: 'ALTA', reason: 'Enferma' })] });
    expect(build([sinVoto]).expressAlert).toMatchObject({ proposalId: 'prop_1', kind: 'RECOORDINACION', who: 'Ana', reason: 'Enferma' });
    const conVoto = prop1({
      state: 'EN_RECOORDINACION', scheduledAt: ayer, incidences: [incidence({ resolved: true })],
      expressVote: voto({ status: 'CERRADA', result: 'REAGENDAR', closedAt: NOW.toISOString() }),
    });
    expect(build([conVoto]).expressAlert).toMatchObject({ kind: 'RECOORDINACION', who: 'Ana', reason: 'Me operan mañana.' });
  });

  it('una tardanza sin resolver deja al asistente como RETRASADO con sus minutos', () => {
    const d = build([prop1({ incidences: [incidence({ type: 'TARDANZA', delayMinutes: 15, criticality: 'BAJA' })] })]);
    expect(d.nextPlan?.attendees[1]).toEqual({ user: ana, isEssential: false, status: 'RETRASADO', delayMinutes: 15 });
  });
});

describe('matchingHours y upcomingPlans', () => {
  it('suma horas enteras (trunca minutos) de las franjas con ≥ 80 %', () => {
    const p = prop2({ windows: [win('a', 1, '10:30', '12:15', 90, 0), win('b', 1, '13:00', '13:45', 100, 0), win('c', 2, '08:00', '20:00', 79, 0)] });
    expect(matchingHours([p])).toBe(2);
  });

  it('no cuenta las canceladas, pero sí las EN_RECOORDINACION y las demás', () => {
    const cancelada = prop2({ id: 'c', state: 'CANCELADO' });
    const recoordinacion = prop1({ id: 'r', state: 'EN_RECOORDINACION' });
    expect(matchingHours([cancelada])).toBe(0);
    expect(matchingHours([cancelada, recoordinacion])).toBe(2);
    expect(matchingHours([cancelada, recoordinacion, prop2()])).toBe(6);
  });

  it('solo confirmados futuros, del más próximo al más lejano', () => {
    const lejano = prop1({ id: 'lejano', scheduledAt: new Date(2026, 9, 6, 9, 0).toISOString() });
    const cercano = prop1({ id: 'cercano', scheduledAt: new Date(2026, 8, 29, 16, 0).toISOString() });
    const pasado = prop1({ id: 'pasado', scheduledAt: new Date(2026, 8, 29, 9, 0).toISOString() });
    expect(upcomingPlans([lejano, pasado, prop2(), cercano], NOW).map((p) => p.id)).toEqual(['cercano', 'lejano']);
  });
});

describe('resumen por grupo (D6: la propuesta más reciente)', () => {
  it('nextWindow trae date', () => {
    expect(build([prop1()]).groups[0].nextWindow?.date).toBe('2026-09-30');
  });

  it('si la más reciente está cancelada, usa la anterior', () => {
    const d = build([prop1(), prop2({ state: 'CANCELADO' })]);
    expect(d.groups[0].nextWindow).toEqual({ date: '2026-09-30', dayOfWeek: 3, startTime: '11:00', endTime: '13:00', availabilityPercentage: 100 });
  });

  it('de la más reciente toma la franja elegida si está confirmada', () => {
    const newer = prop1({
      id: 'prop_9',
      createdAt: new Date(2026, 8, 29, 9, 30).toISOString(),
      windows: [win('w_91', 1, '12:00', '14:00', 100, 0), win('w_92', 4, '10:00', '12:00', 80, 2)],
      chosenWindowId: 'w_92',
    });
    const d = build([prop1(), prop2(), newer]);
    expect(d.groups[0].nextWindow).toEqual({ date: '2026-10-01', dayOfWeek: 4, startTime: '10:00', endTime: '12:00', availabilityPercentage: 80 });
  });

  it('sin propuestas con franjas, nextWindow es null', () => {
    expect(build([prop2({ windows: [] })]).groups[0].nextWindow).toBeNull();
  });
});
