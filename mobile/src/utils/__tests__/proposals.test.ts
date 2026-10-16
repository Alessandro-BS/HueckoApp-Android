import { makeConfirmed, makeProposal, makeWindow } from '../../testing/fixtures';
import {
  availabilityLabel, deadlineLabel, isUpcoming, isVotingOpen, openIncidence, scheduleLabel, STATE_BADGE, voteCountLabel, windowLabel,
} from '../proposals';

const NOW = new Date(2026, 8, 29, 10, 0);

it('etiquetas de franja, votos y disponibilidad (quirk 20: siempre con « · »)', () => {
  expect(windowLabel(makeWindow())).toBe('Mar · 16:00 - 18:00');
  expect(voteCountLabel(0)).toBe('0 votos');
  expect(voteCountLabel(1)).toBe('1 voto');
  expect(voteCountLabel(2)).toBe('2 votos');
  expect(availabilityLabel(67)).toBe('67% del grupo disponible');
});

it('estados con tildes y «Confirmado» en primary (quirk 21)', () => {
  expect(STATE_BADGE.PROPUESTO.text).toBe('En votación');
  expect(STATE_BADGE.EN_RECOORDINACION.text).toBe('Re-coordinando');
  expect(STATE_BADGE.CANCELADO.text).toBe('Cancelado');
  expect(STATE_BADGE.CONFIRMADO).toEqual({ text: 'Confirmado', container: '#6750A4', content: '#FFFFFF' });
});

it('isVotingOpen (C1): PROPUESTO y antes del plazo', () => {
  expect(isVotingOpen(makeProposal(), NOW)).toBe(true);
  expect(isVotingOpen(makeProposal(), new Date(2026, 8, 29, 20, 0))).toBe(false);
  expect(isVotingOpen(makeConfirmed(), NOW)).toBe(false);
});

it('isUpcoming (D3): sin fecha o con scheduledAt en el futuro', () => {
  expect(isUpcoming(makeProposal(), NOW)).toBe(true);
  expect(isUpcoming(makeConfirmed(), NOW)).toBe(true);
  expect(isUpcoming(makeConfirmed({ scheduledAt: NOW.toISOString() }), NOW)).toBe(false);
  expect(isUpcoming(makeConfirmed({ scheduledAt: new Date(2026, 8, 28, 11, 0).toISOString() }), NOW)).toBe(false);
});

it('deadlineLabel: «Cierra» si es futuro, «Cerró» si pasó', () => {
  const iso = new Date(2026, 8, 29, 20, 0).toISOString();
  expect(deadlineLabel(iso, NOW)).toBe('Cierra: Mar 29 sep, 20:00');
  expect(deadlineLabel(iso, new Date(2026, 8, 30))).toBe('Cerró: Mar 29 sep, 20:00');
});

it('scheduleLabel: fecha y franja elegida de un plan confirmado; null si no lo está', () => {
  expect(scheduleLabel(makeConfirmed())).toBe('Mié 30 sep · 11:00 - 13:00');
  expect(scheduleLabel(makeProposal())).toBeNull();
});

it('scheduleLabel (F10): usa scheduledDate del servidor, no scheduledAt en la zona del teléfono', () => {
  // scheduledAt cae varios días después (sábado 3 de octubre, hora local) en cualquier zona horaria:
  // si la etiqueta saliera de scheduledAt diría «Sáb 3 oct»; sale de scheduledDate, «Mié 30 sep».
  const p = makeConfirmed({ scheduledAt: new Date(2026, 9, 3, 11, 0).toISOString(), scheduledDate: '2026-09-30' });
  expect(scheduleLabel(p)).toBe('Mié 30 sep · 11:00 - 13:00');
});

it('openIncidence: la ALTA sin resolver o, si no, la primera sin resolver', () => {
  const base = makeConfirmed().incidences[0];
  expect(openIncidence(makeConfirmed())?.id).toBe('inc_1');
  const alta = { ...base, id: 'alta', criticality: 'ALTA' as const };
  expect(openIncidence(makeConfirmed({ incidences: [base, alta] }))?.id).toBe('alta');
  expect(openIncidence(makeConfirmed({ incidences: [{ ...base, resolved: true }] }))).toBeNull();
});
