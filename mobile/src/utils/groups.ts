import type { MatchWindow } from '@hueckoapp/shared';

// GroupList/GroupDetail singularizan (UI spec §2.4, §2.6).
export const memberCountLabel = (n: number) => (n === 1 ? '1 miembro' : `${n} miembros`);

export type DayWindows = { date: string; dayOfWeek: number; windows: MatchWindow[] };

/** Agrupa las franjas por fecha conservando el orden del servidor (día y hora). */
export function groupWindowsByDay(windows: readonly MatchWindow[]): DayWindows[] {
  const days: DayWindows[] = [];
  for (const window of windows) {
    const last = days.at(-1);
    if (last && last.date === window.date) last.windows.push(window);
    else days.push({ date: window.date, dayOfWeek: window.dayOfWeek, windows: [window] });
  }
  return days;
}
