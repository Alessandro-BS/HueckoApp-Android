import { nextDateOf } from '../WindowEditor';

// TODO(franjas-con-fecha Task 8): adaptador temporal; se borra con el selector de semana.
it('próxima fecha del día elegido en Lima (hoy si la hora aún no llegó)', () => {
  const martes1630 = new Date('2026-09-29T21:30:00Z'); // martes 29/09 16:30 en Lima
  expect(nextDateOf(2, '18:00', martes1630)).toBe('2026-09-29');
  expect(nextDateOf(2, '16:00', martes1630)).toBe('2026-10-06');
  expect(nextDateOf(1, '09:00', martes1630)).toBe('2026-10-05');
  // 20:30 en Lima ya es miércoles en UTC: «hoy» sigue siendo martes.
  expect(nextDateOf(3, '09:00', new Date('2026-09-30T01:30:00Z'))).toBe('2026-09-30');
  expect(nextDateOf(2, '21:00', new Date('2026-09-30T01:30:00Z'))).toBe('2026-09-29');
});
