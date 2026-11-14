// Fechas en la zona de la app (America/Lima), sin depender de la zona del teléfono. Misma semántica que el backend:
// semanas que empiezan en lunes, día ISO 1 = lunes … 7 = domingo.

// Lima no tiene horario de verano: UTC-5 todo el año. Se usa ese desfase fijo, sin Intl: un runtime que ignora
// `timeZone` en silencio (Hermes en Android a veces) daría la fecha del teléfono. hasStarted hace lo mismo.
const LIMA_OFFSET_MS = -5 * 60 * 60 * 1000;
const DAY_MS = 24 * 60 * 60 * 1000;
const WEEKS_AHEAD = 4;

const DAY_SHORT = ['Lun', 'Mar', 'Mié', 'Jue', 'Vie', 'Sáb', 'Dom'];
const MONTH_SHORT = ['ene', 'feb', 'mar', 'abr', 'may', 'jun', 'jul', 'ago', 'sep', 'oct', 'nov', 'dic'];
const WEEK_LABELS = ['Esta semana', 'Próxima semana', 'En 2 semanas', 'En 3 semanas'];

const DATE_RE = /^(\d{4})-(\d{2})-(\d{2})$/;

/** La fecha «YYYY-MM-DD» de `now` vista desde Lima (UTC-5 fijo). Nunca lanza. */
export function limaToday(now: Date): string {
  const shifted = new Date(now.getTime() + LIMA_OFFSET_MS);
  return Number.isNaN(shifted.getTime()) ? '1970-01-01' : shifted.toISOString().slice(0, 10);
}

// Aritmética en UTC para no depender de la zona del proceso.
const utcMidnight = (date: string) => new Date(`${date}T00:00:00Z`);

export function isoDay(date: string): number {
  const day = utcMidnight(date).getUTCDay();
  return day === 0 ? 7 : day;
}

export function addDays(date: string, n: number): string {
  const result = new Date(utcMidnight(date).getTime() + n * DAY_MS);
  return Number.isNaN(result.getTime()) ? date : result.toISOString().slice(0, 10);
}

export const mondayOf = (date: string): string => addDays(date, 1 - isoDay(date));

/** Los 4 lunes para planear: el de la semana de hoy y los 3 siguientes. */
export const weekOptions = (now: Date): { week: string; label: string }[] => {
  const monday = mondayOf(limaToday(now));
  return WEEK_LABELS.slice(0, WEEKS_AHEAD).map((label, i) => ({ week: addDays(monday, i * 7), label }));
};

/** La fecha del día ISO `dayOfWeek` (1 = lunes) de la semana que empieza el lunes `week`. */
export const dateFor = (week: string, dayOfWeek: number): string => addDays(week, dayOfWeek - 1);

/** ¿Ya empezó la franja de `date` a las `time` (hora de Lima)? Lima es UTC-5 fijo, sin Intl. */
export const hasStarted = (date: string, time: string, now: Date): boolean =>
  new Date(`${date}T${time}:00-05:00`).getTime() <= now.getTime();

/** «Jue 20 nov». Con tablas propias, sin Intl. Si la fecha no es válida devuelve el texto tal cual. */
export function shortDate(date: string): string {
  const match = DATE_RE.exec(date);
  if (!match) return date;
  const month = Number(match[2]);
  if (month < 1 || month > 12 || Number.isNaN(utcMidnight(date).getTime())) return date;
  return `${DAY_SHORT[isoDay(date) - 1]} ${Number(match[3])} ${MONTH_SHORT[month - 1]}`;
}
