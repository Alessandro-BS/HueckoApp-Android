import type { HourCount, ProposalCounts, TimeseriesPoint } from '@hueckoapp/shared';

import type { ChartPoint } from '../../components';
import { PROPOSAL_STATE_ORDER, shortDayLabel } from '../../utils/admin';
import { STATE_BADGE } from '../../utils/proposals';

// Solo da forma a los números del servidor para el gráfico: no calcula nada.
export const statePoints = (counts: ProposalCounts): ChartPoint[] =>
  PROPOSAL_STATE_ORDER.map((s) => ({ label: STATE_BADGE[s].text, value: counts[s] }));

// 24 barras: en el eje, etiqueta cada 3 horas para que se lean; el lector de pantalla oye todas.
export const hourPoints = (hours: readonly HourCount[]): ChartPoint[] =>
  hours.map((h) => ({ label: h.hour % 3 === 0 ? `${h.hour}h` : '', a11yLabel: `${h.hour}h`, value: h.count }));

// Como mucho unas 7 etiquetas en el eje X; el resto de puntos va sin etiqueta visible, pero con su día para el lector de pantalla.
export function seriesPoints(points: readonly TimeseriesPoint[], pick: (p: TimeseriesPoint) => number): ChartPoint[] {
  const every = Math.max(1, Math.ceil(points.length / 7));
  return points.map((p, i) => ({ label: i % every === 0 ? shortDayLabel(p.start) : '', a11yLabel: shortDayLabel(p.start), value: pick(p) }));
}
