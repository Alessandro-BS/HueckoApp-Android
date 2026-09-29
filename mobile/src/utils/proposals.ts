import type { Criticality, Incidence, IncidenceType, Proposal, ProposalState, TimeWindow } from '@hueckoapp/shared';

import { colors } from '../theme';
import { dayShort, formatDateLabel, formatDateTime } from './days';

type BadgeStyle = { text: string; container: string; content: string };

// Estados (UI spec §2.6/§2.7, con tildes). Quirk 21: «Confirmado» siempre en primary, que se ve sobre
// tarjetas blancas y sobre primaryContainer.
export const STATE_BADGE: Record<ProposalState, BadgeStyle> = {
  PROPUESTO: { text: 'En votación', container: colors.secondaryContainer, content: colors.onSecondaryContainer },
  CONFIRMADO: { text: 'Confirmado', container: colors.primary, content: colors.onPrimary },
  EN_RECOORDINACION: { text: 'Re-coordinando', container: colors.tertiaryContainer, content: colors.onTertiaryContainer },
  CANCELADO: { text: 'Cancelado', container: colors.errorContainer, content: colors.onErrorContainer },
};

// Cómo se lee una incidencia de otra persona.
export const INCIDENCE_LABEL: Record<IncidenceType, string> = {
  FALTA: 'No podrá ir',
  TARDANZA: 'Llegará tarde',
  IMPREVISTO: 'Imprevisto',
};

export const CRITICALITY_BADGE: Record<Criticality, BadgeStyle> = {
  ALTA: { text: 'Crítica', container: colors.errorContainer, content: colors.onErrorContainer },
  MEDIA: { text: 'Media', container: colors.warningContainer, content: colors.onWarningContainer },
  BAJA: { text: 'Baja', container: colors.surfaceContainerHigh, content: colors.onSurfaceVariant },
};

type WindowLike = Pick<TimeWindow, 'dayOfWeek' | 'startTime' | 'endTime'>;

/** «Mar · 16:00 - 18:00» en todas las pantallas (quirk 20: un solo formato). */
export const windowLabel = (w: WindowLike) => `${dayShort(w.dayOfWeek)} · ${w.startTime} - ${w.endTime}`;

export const voteCountLabel = (n: number) => (n === 1 ? '1 voto' : `${n} votos`);

export const availabilityLabel = (percentage: number) => `${percentage}% del grupo disponible`;

/** C1: se vota con la propuesta en PROPUESTO y antes de su plazo (misma regla que el servidor). */
export const isVotingOpen = (p: Pick<Proposal, 'state' | 'votingDeadline'>, now: Date) =>
  p.state === 'PROPUESTO' && new Date(p.votingDeadline).getTime() > now.getTime();

/** «Cierra: Vie 2 oct, 20:00», o «Cerró: …» si el plazo ya pasó. */
export const deadlineLabel = (iso: string, now: Date) => {
  const date = new Date(iso);
  return `${date.getTime() > now.getTime() ? 'Cierra' : 'Cerró'}: ${formatDateTime(date)}`;
};

/**
 * Fecha del plan confirmado: «Mié 30 sep · 11:00 - 13:00». null si aún no tiene fecha.
 * F10: el día sale de `scheduledDate` (zona del servidor) y la hora de la franja elegida; nunca se
 * deriva de `scheduledAt` en la zona horaria del teléfono.
 */
export function scheduleLabel(p: Pick<Proposal, 'scheduledDate' | 'chosenWindowId' | 'windows'>): string | null {
  const chosen = p.windows.find((w) => w.id === p.chosenWindowId);
  if (!p.scheduledDate || !chosen) return null;
  return `${formatDateLabel(p.scheduledDate)} · ${chosen.startTime} - ${chosen.endTime}`;
}

/** La incidencia sin resolver que se muestra en la alerta: la ALTA o, si no hay, la más antigua. */
export function openIncidence(p: Pick<Proposal, 'incidences'>): Incidence | null {
  const pending = p.incidences.filter((i) => !i.resolved);
  return pending.find((i) => i.criticality === 'ALTA') ?? pending[0] ?? null;
}
