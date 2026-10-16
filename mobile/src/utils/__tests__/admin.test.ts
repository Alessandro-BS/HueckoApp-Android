import { makeAuditEntry } from '../../testing/adminFixtures';
import {
  auditAuthor, auditReason, auditTarget, canSeeAdmin, countLabel, customRange, lastWeeksRange, percentLabel, periodLabel, presetRange, shortDayLabel,
} from '../admin';

const NOW = new Date(2026, 8, 29, 10, 0); // martes 29/09/2026

it('canSeeAdmin solo con rol ADMIN', () => {
  expect(canSeeAdmin(null)).toBe(false);
  expect(canSeeAdmin({ id: 'u1', name: 'Ana', email: 'a@b.co', role: 'USER' })).toBe(false);
  expect(canSeeAdmin({ id: 'u1', name: 'Ana', email: 'a@b.co', role: 'ADMIN' })).toBe(true);
});

it('etiquetas', () => {
  expect(percentLabel(75)).toBe('75 %');
  expect(percentLabel(null)).toBe('—');
  expect(countLabel(1, 'cuenta', 'cuentas')).toBe('1 cuenta');
  expect(countLabel(0, 'cuenta', 'cuentas')).toBe('0 cuentas');
  expect(shortDayLabel('2026-09-28')).toBe('28/09');
  expect(periodLabel('2026-08-31', '2026-09-29')).toBe('Lun 31/08 – Mar 29/09');
});

it('registro: autor (o la consola), objetivo guardado y motivo', () => {
  expect(auditAuthor(makeAuditEntry())).toBe('Administración HueckoApp');
  expect(auditAuthor(makeAuditEntry({ admin: null }))).toBe('Consola del servidor');
  expect(auditTarget(makeAuditEntry())).toBe('Ana');
  expect(auditTarget(makeAuditEntry({ details: { title: 'Fiesta', reason: 'Spam' } }))).toBe('Fiesta');
  expect(auditTarget(makeAuditEntry({ details: {} }))).toBe('u2');
  expect(auditReason(makeAuditEntry({ details: { title: 'Fiesta', reason: 'Spam' } }))).toBe('Spam');
  expect(auditReason(makeAuditEntry())).toBeNull();
});

// Días de calendario del teléfono, ambos incluidos; hoy es el último.
it.each([
  ['7d', '2026-09-23', '2026-09-29'],
  ['30d', '2026-08-31', '2026-09-29'],
  ['semester', '2026-07-01', '2026-09-29'],
] as const)('presetRange(%s): de %s a hoy (%s)', (preset, from, to) => {
  expect(presetRange(preset, NOW)).toEqual({ from, to });
});

it('«Este semestre» en marzo empieza el 1 de enero', () => {
  expect(presetRange('semester', new Date(2026, 2, 15, 9)).from).toBe('2026-01-01');
});

it('los días son los del calendario del teléfono: a las 23:30 sigue siendo hoy', () => {
  expect(presetRange('7d', new Date(2026, 8, 29, 23, 30))).toEqual({ from: '2026-09-23', to: '2026-09-29' });
});

it('customRange: ambos días incluidos; valida que haya fechas, el orden y el máximo de 366 días', () => {
  expect(customRange(new Date(2026, 8, 10, 18), new Date(2026, 8, 20, 7))).toEqual({
    ok: true, range: { from: '2026-09-10', to: '2026-09-20' },
  });
  expect(customRange(new Date(2026, 8, 10), new Date(2026, 8, 10))).toEqual({
    ok: true, range: { from: '2026-09-10', to: '2026-09-10' },
  });
  expect(customRange(null, new Date())).toEqual({ ok: false, error: 'Elige la fecha de inicio y la de fin.' });
  expect(customRange(new Date(2026, 8, 20), new Date(2026, 8, 10))).toEqual({
    ok: false, error: 'La fecha de inicio no puede ser posterior a la de fin.',
  });
  expect(customRange(new Date(2025, 0, 1), new Date(2026, 8, 10))).toEqual({ ok: false, error: 'El periodo no puede superar 366 días.' });
});

it('customRange: 366 días incluidos valen y 367 no', () => {
  expect(customRange(new Date(2025, 8, 29), new Date(2026, 8, 29))).toMatchObject({ ok: true }); // 366 días incluidos
  expect(customRange(new Date(2025, 8, 28), new Date(2026, 8, 29))).toMatchObject({ ok: false }); // 367
});

it('lastWeeksRange: 12 semanas completas desde el lunes hasta hoy', () => {
  expect(lastWeeksRange(NOW, 12)).toEqual({ from: '2026-07-13', to: '2026-09-29' });
});
