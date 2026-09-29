import type { Attendee, BlockType, DashboardGroup } from '@hueckoapp/shared';

import { colors } from '../theme';
import { dayShort } from './days';
import { memberCountLabel } from './groups';

const DAYS = ['Domingo', 'Lunes', 'Martes', 'Miércoles', 'Jueves', 'Viernes', 'Sábado'];
const MONTHS = ['enero', 'febrero', 'marzo', 'abril', 'mayo', 'junio', 'julio', 'agosto', 'septiembre', 'octubre', 'noviembre', 'diciembre'];

/** Hora 0–11 «Buenos días», 12–18 «Buenas tardes», 19–23 «Buenas noches» (domain spec §2.2). */
export function greeting(date: Date): string {
  const hour = date.getHours();
  if (hour < 12) return 'Buenos días';
  if (hour < 19) return 'Buenas tardes';
  return 'Buenas noches';
}

/** «Martes, 29 de septiembre». */
export const longDate = (date: Date) => `${DAYS[date.getDay()]}, ${date.getDate()} de ${MONTHS[date.getMonth()]}`;

/** «Buenos días, Usuario»: la primera palabra del nombre; sin nombre, solo el saludo. */
export function greetingLine(date: Date, name: string | undefined): string {
  const first = (name ?? '').trim().split(/\s+/)[0];
  return first ? `${greeting(date)}, ${first}` : greeting(date);
}

/** «1 de 2 asistirán»: cuentan todos menos quien no podrá ir. */
export const attendanceLabel = (attendees: readonly Attendee[]) =>
  `${attendees.filter((a) => a.status !== 'NO_ASISTE').length} de ${attendees.length} asistirán`;

/** «2 miembros · Mié 11:00 - 13:00» o «… · Sin propuesta aún» (quirk 19: singulariza). */
export const groupSlotLabel = (g: DashboardGroup) =>
  `${memberCountLabel(g.memberCount)} · ${
    g.nextWindow ? `${dayShort(g.nextWindow.dayOfWeek)} ${g.nextWindow.startTime} - ${g.nextWindow.endTime}` : 'Sin propuesta aún'
  }`;

/** «100%», o «—» si el grupo no tiene propuesta (B18: el umbral no es una coincidencia real). */
export const groupMatchLabel = (g: DashboardGroup) => (g.nextWindow ? `${g.nextWindow.availabilityPercentage}%` : '—');

export const weekBlocksLabel = (n: number) => `Tienes ${n} ${n === 1 ? 'bloque' : 'bloques'} en la semana.`;

type BadgeStyle = { text: string; container: string; content: string };
const BUSY: BadgeStyle = { text: 'Ocupado', container: colors.surfaceContainerHigh, content: colors.onSurfaceVariant };

// Etiqueta de cada bloque en «Mi horario de hoy» (UI spec §2.3 punto 5).
export const BLOCK_BADGE: Record<BlockType, BadgeStyle> = {
  LIBRE: { text: 'Libre', container: colors.successContainer, content: colors.onSuccessContainer },
  PUNTUAL: { text: 'Puntual', container: colors.secondaryContainer, content: colors.onSecondaryContainer },
  CLASE: BUSY,
  TRABAJO: BUSY,
};
