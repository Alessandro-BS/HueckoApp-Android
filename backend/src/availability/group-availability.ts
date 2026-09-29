import type { MatchWindow, TimeBlock } from '@hueckoapp/shared';

import { weeklyWindows, type MatcherGroup } from './matcher';

// Reglas añadidas sobre el matcher de Kotlin (domain spec G13 y B14), documentadas en docs/api.md:
// - solo cuentan los bloques recurrentes: la vista es semanal y un puntual tiene fecha, no día fijo;
// - un bloque LIBRE no ocupa: marca tiempo libre.
export function groupAvailability(group: MatcherGroup, blocks: readonly TimeBlock[]): MatchWindow[] {
  const busy = blocks.filter((b) => b.isRecurring && b.type !== 'LIBRE');
  return weeklyWindows(group, busy);
}
