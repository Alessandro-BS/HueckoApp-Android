import type { Group, Proposal, SummaryRecommendation } from '@hueckoapp/shared';
import { z } from 'zod';

import { isVotingOpen } from '../proposals/rules';
import type { JsonSchema } from './ai-client';
import { todayLabel } from './plan-context';
import { userData } from './prompt';

export const RECOMMENDATIONS = ['CONFIRMAR', 'REPROGRAMAR', 'CANCELAR'] as const satisfies readonly SummaryRecommendation[];

const DAY_SHORT = ['Lun', 'Mar', 'Mié', 'Jue', 'Vie', 'Sáb', 'Dom'] as const;

// La recomendación es lo que la app muestra en grande: si no es una de las tres, la respuesta no sirve (502).
export const summaryResponseSchema = z.object({
  summary: z
    .string()
    .trim()
    .min(1)
    .transform((s) => s.slice(0, 600)),
  recommendation: z.enum(RECOMMENDATIONS),
  reason: z
    .string()
    .trim()
    .min(1)
    .transform((s) => s.slice(0, 300)),
});

export const SUMMARY_JSON_SCHEMA: JsonSchema = {
  type: 'object',
  properties: {
    summary: { type: 'string', description: 'Resumen de 2 o 3 frases' },
    recommendation: { type: 'string', enum: [...RECOMMENDATIONS] },
    reason: { type: 'string', description: 'Por qué se recomienda, en una frase' },
  },
  required: ['summary', 'recommendation', 'reason'],
};

/** Lo que la IA necesita saber del plan, sin ids ni correos. */
export function summaryData(p: Proposal, group: Group, now: Date) {
  const essential = new Set(group.members.filter((m) => m.isEssential).map((m) => m.id));
  return {
    plan: p.title,
    estado: p.state,
    lugar: p.location?.name ?? null,
    integrantes: group.members.length,
    votacionAbierta: isVotingOpen(p, now),
    votosEmitidos: p.windows.reduce((total, w) => total + w.voteCount, 0),
    franjas: p.windows.map((w) => ({
      franja: `${DAY_SHORT[w.dayOfWeek - 1]} ${w.startTime}-${w.endTime}`,
      votos: w.voteCount,
      disponibilidad: `${w.availabilityPercentage} %`,
      elegida: w.id === p.chosenWindowId,
    })),
    imprevistos: p.incidences.map((i) => ({
      quien: i.user.name,
      imprescindible: essential.has(i.user.id),
      tipo: i.type,
      criticidad: i.criticality,
      resuelto: i.resolved,
      retrasoMinutos: i.delayMinutes,
      motivo: i.reason,
    })),
  };
}

export function summaryPrompt(p: Proposal, group: Group, now: Date): string {
  return [
    `Resume en español, en 2 o 3 frases, cómo va el plan de un grupo de ${group.members.length} integrantes. Hoy es ${todayLabel(now)}.`,
    'Cuenta cuántos votaron, qué franja va ganando y qué imprevistos hay. Después recomienda UNA acción para quien organiza el plan:',
    '- CONFIRMAR: hay una franja clara y ningún imprevisto grave pendiente (o el plan ya está confirmado y sigue en pie).',
    '- REPROGRAMAR: votos repartidos o muy pocos votos, o un imprescindible no puede ir.',
    '- CANCELAR: casi nadie puede ir o el plan ya no tiene sentido.',
    '"reason" explica la recomendación en una frase. Tú no decides: solo sugieres.',
    '',
    // Título, lugar y motivos los escriben los usuarios: todo el JSON entra como dato (userData quita las marcas).
    userData(JSON.stringify(summaryData(p, group, now), null, 2)),
  ].join('\n');
}
