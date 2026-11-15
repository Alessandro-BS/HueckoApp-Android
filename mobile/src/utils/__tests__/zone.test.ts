import { addDays, closesInLabel, dateFor, hasStarted, isoDay, limaToday, mondayOf, shortDate, weekOptions } from '../zone';

afterEach(() => jest.restoreAllMocks());

it('limaToday: la fecha de Lima, no la de UTC', () => {
  expect(limaToday(new Date('2026-11-16T04:30:00Z'))).toBe('2026-11-15');
  expect(limaToday(new Date('2026-11-16T05:00:00Z'))).toBe('2026-11-16');
});

it('limaToday: UTC-5 fijo, sin Intl (un Intl que ignora timeZone, falla o no existe no la cambia)', () => {
  const now = new Date('2026-11-16T04:30:00Z');
  const fake = (impl: object) => jest.spyOn(Intl, 'DateTimeFormat').mockImplementation(() => impl as Intl.DateTimeFormat);
  // Un runtime que ignora `timeZone` en silencio devuelve la fecha de UTC (16/11).
  fake({ formatToParts: () => [{ type: 'year', value: '2026' }, { type: 'month', value: '11' }, { type: 'day', value: '16' }] });
  expect(limaToday(now)).toBe('2026-11-15');
  fake({ formatToParts: () => { throw new RangeError('timeZone'); } });
  expect(limaToday(now)).toBe('2026-11-15');
  jest.spyOn(Intl, 'DateTimeFormat').mockImplementation(() => { throw new Error('sin Intl'); });
  expect(limaToday(now)).toBe('2026-11-15');
});

it('limaToday no lanza con una fecha inválida', () => {
  expect(() => limaToday(new Date(NaN))).not.toThrow();
});

it('isoDay, addDays y mondayOf (semanas de lunes a domingo)', () => {
  expect(isoDay('2026-11-16')).toBe(1);
  expect(isoDay('2026-11-22')).toBe(7);
  expect(addDays('2026-11-30', 1)).toBe('2026-12-01');
  expect(mondayOf('2026-11-22')).toBe('2026-11-16');
  expect(mondayOf('2026-11-16')).toBe('2026-11-16');
});

it('weekOptions: 4 lunes con sus etiquetas', () => {
  expect(weekOptions(new Date('2026-11-19T15:00:00Z'))).toEqual([
    { week: '2026-11-16', label: 'Esta semana' },
    { week: '2026-11-23', label: 'Próxima semana' },
    { week: '2026-11-30', label: 'En 2 semanas' },
    { week: '2026-12-07', label: 'En 3 semanas' },
  ]);
  // Domingo 22:00 en Lima = lunes en UTC: sigue siendo la semana anterior.
  expect(weekOptions(new Date('2026-11-23T03:00:00Z'))[0].week).toBe('2026-11-16');
});

it('dateFor: la fecha de un día de la semana', () => {
  expect(dateFor('2026-11-16', 4)).toBe('2026-11-19');
  expect(dateFor('2026-11-16', 1)).toBe('2026-11-16');
  expect(dateFor('2026-11-16', 7)).toBe('2026-11-22');
});

it('hasStarted compara en hora de Lima', () => {
  expect(hasStarted('2026-11-19', '16:00', new Date('2026-11-19T21:30:00Z'))).toBe(true);
  expect(hasStarted('2026-11-19', '16:00', new Date('2026-11-19T20:59:00Z'))).toBe(false);
  expect(hasStarted('2026-11-19', '16:00', new Date('2026-11-19T21:00:00Z'))).toBe(true);
});

it('shortDate: «Jue 20 nov» con nombres propios', () => {
  expect(shortDate('2026-11-20')).toBe('Vie 20 nov');
  expect(shortDate('2026-11-19')).toBe('Jue 19 nov');
  expect(shortDate('2026-01-05')).toBe('Lun 5 ene');
  expect(shortDate('basura')).toBe('basura');
});

it('closesInLabel: minutos que faltan, redondeando hacia arriba', () => {
  const now = new Date('2026-11-16T15:00:00Z');
  expect(closesInLabel('2026-11-16T15:42:00Z', now)).toBe('Cierra en 42 min');
  expect(closesInLabel('2026-11-16T15:41:30Z', now)).toBe('Cierra en 42 min');
  expect(closesInLabel('2026-11-16T15:00:01Z', now)).toBe('Cierra en 1 min');
  // Vencida pero aún sin cerrar (se cierra al volver a consultar).
  expect(closesInLabel('2026-11-16T15:00:00Z', now)).toBe('Cerrando la votación…');
  expect(closesInLabel('no es fecha', now)).toBe('Cerrando la votación…');
});
