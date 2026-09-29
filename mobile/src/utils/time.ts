// Misma regla que AddScheduleScreen.kt y que el backend: "HH:mm" de 00:00 a 23:59, con dos dígitos.
export const TIME_REGEX = /^([01]\d|2[0-3]):[0-5]\d$/;

export const isValidTime = (value: string) => TIME_REGEX.test(value);

export const toMinutes = (value: string) => Number(value.slice(0, 2)) * 60 + Number(value.slice(3, 5));

export type FieldHint = { text: string; error: boolean };

// Texto bajo cada campo (UI spec §2.10): siempre visible, en rojo si hay error.
export const startTimeHint = (start: string): FieldHint =>
  isValidTime(start) ? { text: 'Inicio', error: false } : { text: 'Formato HH:mm', error: true };

export function endTimeHint(start: string, end: string): FieldHint {
  if (!isValidTime(end)) return { text: 'Formato HH:mm', error: true };
  if (isValidTime(start) && toMinutes(end) <= toMinutes(start)) return { text: 'Debe ser posterior', error: true };
  return { text: 'Fin', error: false };
}

export const isValidRange = (start: string, end: string) =>
  isValidTime(start) && isValidTime(end) && toMinutes(end) > toMinutes(start);
