import { endTimeHint, isValidRange, isValidTime, startTimeHint, toMinutes } from '../time';

describe('horas HH:mm', () => {
  it.each([
    ['00:00', true], ['23:59', true], ['08:30', true],
    ['8:00', false], ['24:00', false], ['12:60', false], ['', false], ['ab:cd', false],
  ])('isValidTime(%j) → %s', (v, ok) => expect(isValidTime(v)).toBe(ok));

  it('toMinutes', () => expect(toMinutes('10:30')).toBe(630));

  it('pista de inicio', () => {
    expect(startTimeHint('08:00')).toEqual({ text: 'Inicio', error: false });
    expect(startTimeHint('8:00')).toEqual({ text: 'Formato HH:mm', error: true });
  });

  it('pista de fin: formato, orden o todo bien', () => {
    expect(endTimeHint('08:00', '9')).toEqual({ text: 'Formato HH:mm', error: true });
    expect(endTimeHint('10:00', '10:00')).toEqual({ text: 'Debe ser posterior', error: true });
    expect(endTimeHint('10:00', '09:59')).toEqual({ text: 'Debe ser posterior', error: true });
    expect(endTimeHint('08:00', '10:00')).toEqual({ text: 'Fin', error: false });
    expect(endTimeHint('8:00', '10:00')).toEqual({ text: 'Fin', error: false }); // el error va en el inicio
  });

  it('isValidRange exige ambas válidas y fin estrictamente posterior', () => {
    expect(isValidRange('08:00', '09:00')).toBe(true);
    expect(isValidRange('09:00', '09:00')).toBe(false);
    expect(isValidRange('8:00', '09:00')).toBe(false);
  });
});
