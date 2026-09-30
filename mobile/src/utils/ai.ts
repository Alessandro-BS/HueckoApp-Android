import type {
  MatchWindow, PlanCategory, PlanSuggestion, ProposalDraft, SummaryRecommendation, TimeWindowInput,
} from '@hueckoapp/shared';

import type { IconName } from '../components/icons';
import { colors } from '../theme';

export const AI_DEMO_TEXT = 'Modo demostración: el servidor no tiene clave de Gemini y Huecko IA responde con datos de ejemplo.';

export const CATEGORY_LABEL: Record<PlanCategory, string> = {
  ESTUDIO: 'Estudio',
  REUNION: 'Reunión',
  COMIDA: 'Comida',
  DEPORTE: 'Deporte',
  SALIDA: 'Salida',
  OTRO: 'Otro',
};

export const CATEGORY_ICON: Record<PlanCategory, IconName> = {
  ESTUDIO: 'menu-book',
  REUNION: 'groups',
  COMIDA: 'restaurant',
  DEPORTE: 'sports-soccer',
  SALIDA: 'celebration',
  OTRO: 'event',
};

type BadgeStyle = { text: string; container: string; content: string };

export const RECOMMENDATION_BADGE: Record<SummaryRecommendation, BadgeStyle> = {
  CONFIRMAR: { text: 'Confirmar', container: colors.successContainer, content: colors.onSuccessContainer },
  REPROGRAMAR: { text: 'Reprogramar', container: colors.warningContainer, content: colors.onWarningContainer },
  CANCELAR: { text: 'Cancelar', container: colors.errorContainer, content: colors.onErrorContainer },
};

// Lo que «Nueva propuesta» recibe para abrirse rellenada (ruta CreateProposal, parámetro `prefill`).
export type ProposalPrefill = {
  title: string;
  placeName: string | null;
  window: TimeWindowInput | null;
  votingDeadline: string | null;
  category: PlanCategory;
};

const toWindowInput = (w: MatchWindow | null): TimeWindowInput | null =>
  w ? { dayOfWeek: w.dayOfWeek, startTime: w.startTime, endTime: w.endTime } : null;

export const prefillFromDraft = (d: ProposalDraft): ProposalPrefill => ({
  title: d.title,
  placeName: d.placeName,
  window: toWindowInput(d.window),
  votingDeadline: d.votingDeadline,
  category: d.category,
});

// Una idea no trae plazo: lo elige el usuario en el formulario.
export const prefillFromSuggestion = (s: PlanSuggestion): ProposalPrefill => ({
  title: s.title,
  placeName: s.placeIdea,
  window: toWindowInput(s.window),
  votingDeadline: null,
  category: s.category,
});

export const ocrCountLabel = (n: number) => (n === 1 ? '1 bloque detectado' : `${n} bloques detectados`);

export const savedBlocksMessage = (n: number) =>
  n === 1 ? 'Se añadió 1 bloque a tu horario.' : `Se añadieron ${n} bloques a tu horario.`;
