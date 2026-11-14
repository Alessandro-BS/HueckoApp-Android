import type { ExpressOption } from '@hueckoapp/shared';
import { z } from 'zod';

import { EXPRESS_OPTIONS, quorumFor } from '../proposals/express-rules';
import type { expressVotesRepository } from '../proposals/express-votes.repository';
import type { AiClient, JsonSchema } from './ai-client';
import { type AiCallRecorder, askAi } from './ask-ai';
import { userData } from './prompt';

// Lo mismo que el resumen de votación: si la opción no es una de las tres, la respuesta no sirve.
export const expressRecommendationSchema = z.object({
  option: z.enum(EXPRESS_OPTIONS),
  reason: z
    .string()
    .trim()
    .min(1)
    .transform((s) => s.slice(0, 300)),
});

export const EXPRESS_RECOMMENDATION_JSON_SCHEMA: JsonSchema = {
  type: 'object',
  properties: {
    option: { type: 'string', enum: [...EXPRESS_OPTIONS] },
    reason: { type: 'string', description: 'Por qué se recomienda, en una frase' },
  },
  required: ['option', 'reason'],
};

export type ExpressRecommendationInput = {
  voteId: string;
  planTitle: string;
  location: string | null;
  startsAt: string;
  hoursLeft: number;
  reason: string;
  criticalReason: string;
  eligibleVoters: number;
  defaultResult: 'MANTENER';
};

// El quórum real (express-rules): 2 votos, o todos los votantes si son menos. Con uno solo, basta con que vote.
const noQuorum = (quorum: number) => (quorum <= 1 ? 'Si nadie vota' : `Si votan menos de ${quorum} personas (el quórum)`);

/** Solo datos del plan y de la ausencia: ni correos ni ids (lo que escriben los usuarios entra como dato). */
export function expressRecommendationPrompt(i: ExpressRecommendationInput): string {
  return [
    'Un integrante clave de un grupo de amigos o compañeros avisó que no puede ir a un plan ya confirmado, y el grupo vota qué hacer.',
    'Recomienda UNA opción para que el grupo la tenga en cuenta al votar:',
    '- MANTENER: el plan sigue como está (la ausencia no lo vuelve inviable).',
    '- REAGENDAR: conviene buscar otra fecha para que pueda ir quien falta.',
    '- CANCELAR: sin esa persona el plan ya no tiene sentido.',
    `${noQuorum(quorumFor(i.eligibleVoters))}, el resultado por defecto es ${i.defaultResult}. Tú no decides: solo sugieres.`,
    '"reason" explica la recomendación en una frase, en español.',
    '',
    userData(
      JSON.stringify(
        {
          plan: i.planTitle,
          lugar: i.location,
          empieza: i.startsAt,
          horasHastaElPlan: i.hoursLeft,
          motivoDeLaAusencia: i.reason,
          porQueEsCritica: i.criticalReason,
          votantes: i.eligibleVoters,
        },
        null,
        2,
      ),
    ),
  ].join('\n');
}

/**
 * Pide a la IA qué conviene votar y lo guarda en la votación si sigue ABIERTA. Se llama sin esperar tras responder el
 * reporte: nunca lanza (un fallo de la IA o de la base solo deja la votación sin recomendación).
 */
export async function recommendExpressVote(
  deps: { ai: AiClient; record: AiCallRecorder; votes: Pick<ReturnType<typeof expressVotesRepository>, 'saveRecommendation'> },
  input: ExpressRecommendationInput,
): Promise<void> {
  try {
    const { option, reason }: { option: ExpressOption; reason: string } = await askAi(
      deps.ai,
      { task: 'express-recommendation', prompt: expressRecommendationPrompt(input), schema: EXPRESS_RECOMMENDATION_JSON_SCHEMA },
      expressRecommendationSchema,
      deps.record,
    );
    await deps.votes.saveRecommendation(input.voteId, option, reason);
  } catch (error) {
    if (process.env.NODE_ENV !== 'test') console.error('[ia] express-recommendation: sin recomendación', error);
  }
}
