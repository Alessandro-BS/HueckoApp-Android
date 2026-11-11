// Fechas y semanas en una zona horaria fija. Nunca se usa `TZ` del proceso ni la zona del celular:
// Render corre en UTC y a las 20:00 de Lima ya es el día siguiente en UTC.
export const APP_TIME_ZONE = 'America/Lima';

// Lima no tiene horario de verano, así que el desfase es fijo (UTC-5).
// Si algún día cambiara, `instant` tendría que calcular el offset con Intl en vez de fijarlo.
const LIMA_OFFSET = '-05:00';

const DAY_MS = 24 * 60 * 60 * 1000;
const WEEKS_AHEAD = 4;

// Fecha "YYYY-MM-DD" del instante `now` vista desde Lima.
export const today = (now: Date): string => {
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone: APP_TIME_ZONE,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).formatToParts(now);
  const value = (type: string) => parts.find((part) => part.type === type)?.value ?? '';
  return `${value('year')}-${value('month')}-${value('day')}`;
};

// 1 = lunes … 7 = domingo. Aritmética en UTC para no depender de la zona del proceso.
export const isoDay = (date: string): number => {
  const day = new Date(`${date}T00:00:00Z`).getUTCDay();
  return day === 0 ? 7 : day;
};

export const addDays = (date: string, days: number): string =>
  new Date(new Date(`${date}T00:00:00Z`).getTime() + days * DAY_MS).toISOString().slice(0, 10);

export const mondayOf = (date: string): string => addDays(date, 1 - isoDay(date));

// Instante UTC de `date` a las `time` ("HH:mm") en Lima.
export const instant = (date: string, time: string): Date => new Date(`${date}T${time}:00${LIMA_OFFSET}`);

// Los 4 lunes válidos para planear: el de la semana de hoy y las 3 siguientes.
export const validWeeks = (now: Date): string[] => {
  const monday = mondayOf(today(now));
  return Array.from({ length: WEEKS_AHEAD }, (_, index) => addDays(monday, index * 7));
};

// "2026-02-30" pasa la regex de formato pero no existe: se comprueba que la fecha sea real.
export const isRealDate = (value: string): boolean => {
  const date = new Date(`${value}T00:00:00Z`);
  return !Number.isNaN(date.getTime()) && date.toISOString().slice(0, 10) === value;
};
