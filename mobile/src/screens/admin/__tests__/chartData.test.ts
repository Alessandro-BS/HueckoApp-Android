import { makeHours, makeReport } from '../../../testing/adminFixtures';
import { hourPoints, seriesPoints, statePoints } from '../chartData';

it('hourPoints: 24 barras con etiqueta cada 3 horas; el lector de pantalla oye todas las horas', () => {
  const points = hourPoints(makeHours());
  expect(points).toHaveLength(24);
  expect(points[0]).toEqual({ label: '0h', a11yLabel: '0h', value: 0 });
  expect(points[11]).toEqual({ label: '', a11yLabel: '11h', value: 2 });
  expect(points[12]).toEqual({ label: '12h', a11yLabel: '12h', value: 0 });
});

it('seriesPoints: como mucho unas 7 etiquetas', () => {
  const twelve = Array.from({ length: 12 }, (_, i) => ({
    start: `2026-07-${String(13 + i).padStart(2, '0')}`, registrations: i, groupsCreated: 0, proposalsCreated: 0, aiCalls: 0,
  }));
  const points = seriesPoints(twelve, (p) => p.registrations);
  expect(points.map((p) => p.value)).toEqual([0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11]);
  expect(points.filter((p) => p.label !== '')).toHaveLength(6);
  expect(points[0].label).toBe('13/07');
  // Sin etiqueta en el eje, pero el lector de pantalla oye el día de cada punto.
  expect(points[1]).toEqual({ label: '', a11yLabel: '14/07', value: 1 });
  expect(points.every((p) => p.a11yLabel !== '')).toBe(true);
  expect(seriesPoints(makeReport().timeseries, (p) => p.aiCalls)).toEqual([
    { label: '28/09', a11yLabel: '28/09', value: 3 },
    { label: '29/09', a11yLabel: '29/09', value: 1 },
  ]);
});

it('statePoints en el orden fijo de los estados', () => {
  expect(statePoints({ PROPUESTO: 1, CONFIRMADO: 2, EN_RECOORDINACION: 3, CANCELADO: 4 })).toEqual([
    { label: 'En votación', value: 1 },
    { label: 'Confirmado', value: 2 },
    { label: 'Re-coordinando', value: 3 },
    { label: 'Cancelado', value: 4 },
  ]);
});
