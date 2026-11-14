import type { TimeWindowInput } from '@hueckoapp/shared';

export const MIN_WINDOWS = 2;
export const MAX_WINDOWS = 5;
export const DEADLINE_AFTER_WINDOW = 'La votación debe cerrar antes de la primera franja';

/** Inicio (ms) de la franja que empieza antes, en hora de Lima; null si no hay franjas. */
export const firstWindowStart = (windows: readonly TimeWindowInput[]): number | null =>
  windows.reduce<number | null>((min, w) => {
    const start = new Date(`${w.date}T${w.startTime}:00-05:00`).getTime();
    return min === null || start < min ? start : min;
  }, null);

/** El plazo de votación debe ser anterior al inicio de la primera franja (el servidor responde 400 si no). */
export const deadlineAfterFirstWindow = (deadline: Date | null, windows: readonly TimeWindowInput[]) => {
  const first = firstWindowStart(windows);
  return deadline !== null && first !== null && deadline.getTime() >= first;
};
