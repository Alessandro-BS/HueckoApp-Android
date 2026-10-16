import type { GroupMember, GroupSummary, Incidence, ProposalWithGroup, TimeWindow, User } from '@hueckoapp/shared';
import { describe, expect, it } from 'vitest';

import { buildDashboard, matchingHours, upcomingPlans } from '../src/dashboard/dashboard';
import { NOW } from './helpers';

const test: User = { id: 'u-test', name: 'Usuario de Prueba', email: 'test@test.com' };
const ana: User = { id: 'u-ana', name: 'Ana', email: 'ana@test.com' };
const members: GroupMember[] = [
  { ...test, role: 'OWNER', isEssential: false },
  { ...ana, role: 'MEMBER', isEssential: false },
];
const groups: GroupSummary[] = [{ id: 'g1', name: 'Proyecto Integrador', description: '', memberCount: 2, availabilityThreshold: 80 }];

const win = (id: string, dayOfWeek: number, startTime: string, endTime: string, availabilityPercentage: number, voteCount: number): TimeWindow => ({
  id, dayOfWeek, startTime, endTime, availabilityPercentage, voteCount,
});
const incidence = (over: Partial<Incidence> = {}): Incidence => ({
  id: 'inc_1', user: ana, type: 'IMPREVISTO', reason: 'Cruce con un examen de laboratorio a última hora.',
  delayMinutes: null, criticality: 'MEDIA', resolved: false, createdAt: NOW.toISOString(), ...over,
});

// prop_1 y prop_2 con los porcentajes fijos de la semilla Kotlin (w_23 = 50 %, B15).
const prop1 = (over: Partial<ProposalWithGroup> = {}): ProposalWithGroup => ({
  id: 'prop_1', groupId: 'g1', groupName: 'Proyecto Integrador', title: 'Reunión de avance del proyecto',
  location: { name: 'Biblioteca central', latitude: null, longitude: null }, createdBy: test,
  votingDeadline: new Date(2026, 8, 28, 10, 0).toISOString(), state: 'CONFIRMADO',
  windows: [win('w_1', 3, '11:00', '13:00', 100, 2)], myVoteWindowId: 'w_1', canManage: true, chosenWindowId: 'w_1',
  scheduledAt: new Date(2026, 8, 30, 11, 0).toISOString(), scheduledDate: '2026-09-30', incidences: [incidence()],
  createdAt: new Date(2026, 8, 27, 10, 0).toISOString(), ...over,
});
const prop2 = (over: Partial<ProposalWithGroup> = {}): ProposalWithGroup => ({
  id: 'prop_2', groupId: 'g1', groupName: 'Proyecto Integrador', title: 'Repaso antes de la entrega',
  location: { name: 'Google Meet', latitude: null, longitude: null }, createdBy: ana,
  votingDeadline: new Date(2026, 8, 29, 20, 0).toISOString(), state: 'PROPUESTO',
  windows: [win('w_21', 2, '16:00', '18:00', 100, 1), win('w_22', 4, '10:00', '12:00', 100, 0), win('w_23', 5, '16:00', '18:00', 50, 0)],
  myVoteWindowId: null, canManage: false, chosenWindowId: null, scheduledAt: null, scheduledDate: null, incidences: [],
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
      { id: 'g1', name: 'Proyecto Integrador', memberCount: 2, nextWindow: { dayOfWeek: 2, startTime: '16:00', endTime: '18:00', availabilityPercentage: 100 } },
    ]);
    expect(d.pendingVotes.map((p) => p.id)).toEqual(['prop_2']);
    expect(d.expressAlert).toEqual({
      proposalId: 'prop_1', planTitle: 'Reunión de avance del proyecto', groupName: 'Proyecto Integrador',
      who: 'Ana', reason: 'Cruce con un examen de laboratorio a última hora.', kind: 'AVISO', canResolve: true, createdBy: test,
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
    expect(d.groups[0].nextWindow).toEqual({ dayOfWeek: 2, startTime: '16:00', endTime: '18:00', availabilityPercentage: 100 });
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
    // Control positivo: el mismo plan, gestionable por quien pregunta (p. ej. el OWNER si quien lo creó se fue).
    expect(build([aviso, { ...recoordinacion, canManage: true }]).expressAlert?.canResolve).toBe(true);
  });

  it('un plan que ya ocurrió no es el próximo ni dispara la alerta', () => {
    const pasado = prop1({ scheduledAt: new Date(2026, 8, 28, 11, 0).toISOString() });
    const d = build([pasado]);
    expect(d.nextPlan).toBeNull();
    expect(d.expressAlert).toBeNull();
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
  it('si la más reciente está cancelada, usa la anterior', () => {
    const d = build([prop1(), prop2({ state: 'CANCELADO' })]);
    expect(d.groups[0].nextWindow).toEqual({ dayOfWeek: 3, startTime: '11:00', endTime: '13:00', availabilityPercentage: 100 });
  });

  it('de la más reciente toma la franja elegida si está confirmada', () => {
    const newer = prop1({
      id: 'prop_9',
      createdAt: new Date(2026, 8, 29, 9, 30).toISOString(),
      windows: [win('w_91', 1, '12:00', '14:00', 100, 0), win('w_92', 4, '10:00', '12:00', 80, 2)],
      chosenWindowId: 'w_92',
    });
    const d = build([prop1(), prop2(), newer]);
    expect(d.groups[0].nextWindow).toEqual({ dayOfWeek: 4, startTime: '10:00', endTime: '12:00', availabilityPercentage: 80 });
  });

  it('sin propuestas con franjas, nextWindow es null', () => {
    expect(build([prop2({ windows: [] })]).groups[0].nextWindow).toBeNull();
  });
});
