import { makeDashboard } from '../../testing/fixtures';
import { attendanceLabel, greeting, greetingLine, groupMatchLabel, groupSlotLabel, longDate, weekBlocksLabel } from '../dashboard';

it.each([
  [0, 'Buenos días'],
  [11, 'Buenos días'],
  [12, 'Buenas tardes'],
  [18, 'Buenas tardes'],
  [19, 'Buenas noches'],
  [23, 'Buenas noches'],
])('greeting a las %i → %s', (hour, expected) => {
  expect(greeting(new Date(2026, 8, 29, hour, 30))).toBe(expected);
});

it('longDate y greetingLine (primera palabra del nombre; sin nombre, solo el saludo)', () => {
  const tuesday = new Date(2026, 8, 29, 10, 0);
  expect(longDate(tuesday)).toBe('Martes, 29 de septiembre');
  expect(greetingLine(tuesday, 'Usuario de Prueba')).toBe('Buenos días, Usuario');
  expect(greetingLine(tuesday, 'Ana Pérez')).toBe('Buenos días, Ana');
  expect(greetingLine(tuesday, undefined)).toBe('Buenos días');
});

it('attendanceLabel cuenta a quien no falta', () => {
  expect(attendanceLabel(makeDashboard().nextPlan!.attendees)).toBe('1 de 2 asistirán');
});

it('resumen del grupo: singulariza (quirk 19) y «—» sin propuesta (B18)', () => {
  const [g] = makeDashboard().groups;
  expect(groupSlotLabel(g)).toBe('2 miembros · Mié 11:00 - 13:00');
  expect(groupMatchLabel(g)).toBe('100%');
  const solo = { ...g, memberCount: 1, nextWindow: null };
  expect(groupSlotLabel(solo)).toBe('1 miembro · Sin propuesta aún');
  expect(groupMatchLabel(solo)).toBe('—');
});

it('weekBlocksLabel', () => {
  expect(weekBlocksLabel(1)).toBe('Tienes 1 bloque en la semana.');
  expect(weekBlocksLabel(2)).toBe('Tienes 2 bloques en la semana.');
});
