import { groupWindowsByDay, memberCountLabel } from '../groups';

it('memberCountLabel singulariza', () => {
  expect(memberCountLabel(1)).toBe('1 miembro');
  expect(memberCountLabel(3)).toBe('3 miembros');
});

it('groupWindowsByDay agrupa conservando el orden del servidor', () => {
  const w = (dayOfWeek: number, startTime: string, date = `2026-11-${15 + dayOfWeek}`) => ({ date, dayOfWeek, startTime, endTime: '20:00', availabilityPercentage: 100, freeMembers: 2 });
  expect(groupWindowsByDay([w(1, '12:00'), w(3, '08:00'), w(3, '19:00')])).toEqual([
    { date: '2026-11-16', dayOfWeek: 1, windows: [w(1, '12:00')] },
    { date: '2026-11-18', dayOfWeek: 3, windows: [w(3, '08:00'), w(3, '19:00')] },
  ]);
  // Mismo día de la semana en semanas distintas: grupos separados.
  expect(groupWindowsByDay([w(3, '08:00'), w(3, '08:00', '2026-11-25')]).map((d) => d.date)).toEqual(['2026-11-18', '2026-11-25']);
  expect(groupWindowsByDay([])).toEqual([]);
});
