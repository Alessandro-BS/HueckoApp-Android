import type { MatchWindow } from '@hueckoapp/shared';

// Puerto EXACTO de AvailabilityMatcher.kt (legacy-android). Función pura, sin base de datos.
// Reglas y ejemplos: docs/superpowers/specs/2026-09-29-domain-logic-spec.md §1.
// No añadir reglas aquí: las nuevas van en group-availability.ts.

/** La hora h representa la franja [h:00, h+1:00). La agenda va de 08:00 a 20:00. */
export const AGENDA_FIRST_HOUR = 8;
export const AGENDA_LAST_HOUR = 19;
export const WEEK = [1, 2, 3, 4, 5, 6, 7] as const;

export type MatcherGroup = { memberIds: readonly string[]; availabilityThreshold: number };
export type MatcherBlock = { userId: string; dayOfWeek: number | null; startTime: string; endTime: string };

// Igual que String.toIntOrNull() de Kotlin: dígitos con signo opcional; si no, null.
const toIntOrNull = (s: string | undefined): number | null => (s !== undefined && /^[+-]?\d+$/.test(s) ? Number(s) : null);

/** TimeBlock.startHour: hora de inicio truncando minutos ("10:30" → 10). Lo no numérico vale 0. */
export function startHour(time: string): number {
  const colon = time.indexOf(':');
  return toIntOrNull(colon === -1 ? time : time.slice(0, colon)) ?? 0;
}

/** TimeBlock.endHour: hora de fin redondeada hacia arriba ("10:30" → 11, "11:00" → 11). */
export function endHour(time: string): number {
  const [hourPart, minutePart] = time.split(':');
  const hour = toIntOrNull(hourPart) ?? 0;
  const minutes = toIntOrNull(minutePart) ?? 0;
  return minutes > 0 ? hour + 1 : hour;
}

type HourWindow = { startHour: number; endHour: number; availabilityPercentage: number; freeMembers: number };

const pad2 = (n: number) => String(n).padStart(2, '0');

/**
 * Franjas del día `day` (1–7) en las que al menos el umbral del grupo está libre.
 * Una franja se describe por su hora MENOS disponible (mínimo), no por la media.
 */
export function windowsFor(group: MatcherGroup, blocks: readonly MatcherBlock[], day: number): MatchWindow[] {
  const size = group.memberIds.length;
  if (size === 0) return [];

  const members = new Set(group.memberIds);
  const relevant = blocks.filter((b) => members.has(b.userId) && b.dayOfWeek === day);
  const windows: HourWindow[] = [];

  for (let hour = AGENDA_FIRST_HOUR; hour <= AGENDA_LAST_HOUR; hour++) {
    const busy = new Set(
      relevant.filter((b) => hour >= startHour(b.startTime) && hour < endHour(b.endTime)).map((b) => b.userId),
    );
    const free = size - busy.size;
    // Math.round de Java (floor(x + 0.5)); idéntico al de JS para valores ≥ 0.
    const percentage = Math.round((free * 100) / size);
    if (percentage < group.availabilityThreshold) continue;

    const last = windows.at(-1);
    if (last && last.endHour === hour) {
      last.endHour = hour + 1;
      last.availabilityPercentage = Math.min(last.availabilityPercentage, percentage);
      last.freeMembers = Math.min(last.freeMembers, free);
    } else {
      windows.push({ startHour: hour, endHour: hour + 1, availabilityPercentage: percentage, freeMembers: free });
    }
  }

  return windows.map((w) => ({
    dayOfWeek: day,
    startTime: `${pad2(w.startHour)}:00`,
    endTime: `${pad2(w.endHour)}:00`,
    availabilityPercentage: w.availabilityPercentage,
    freeMembers: w.freeMembers,
  }));
}

/** Lunes a domingo concatenados: el resultado queda ordenado por día y hora (allWindowsFor en Kotlin). */
export function weeklyWindows(group: MatcherGroup, blocks: readonly MatcherBlock[]): MatchWindow[] {
  return WEEK.flatMap((day) => windowsFor(group, blocks, day));
}
