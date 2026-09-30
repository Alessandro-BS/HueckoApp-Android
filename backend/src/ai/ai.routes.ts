import type { AiStatus, PlanSuggestions, ProposalDraft, ScheduleOcrResult, VotingSummary } from '@hueckoapp/shared';
import { Router } from 'express';

import type { ResolvedDeps } from '../app';
import { getUserId } from '../auth/require-auth';
import { loadGroupForMember } from '../groups/group-access';
import { groupsRepository } from '../groups/groups.repository';
import { ApiError } from '../middleware/errors';
import { proposalsRepository } from '../proposals/proposals.repository';
import { timeBlocksRepository } from '../schedule/time-blocks.repository';
import { aiCallRecorder, aiCallsRepository } from './ai-calls.repository';
import { askAi } from './ask-ai';
import { commonWindows, pickWindow } from './plan-context';
import {
  DRAFT_JSON_SCHEMA, draftDeadline, draftPrompt, draftResponseSchema, proposalDraftInputSchema,
  SUGGESTIONS_JSON_SCHEMA, suggestionsPrompt, suggestionsResponseSchema,
} from './plan-ideas';
import { OCR_JSON_SCHEMA, OCR_PROMPT, ocrResponseSchema, toOcrBlocks } from './schedule-ocr';
import { uploadScheduleImage } from './upload';
import { SUMMARY_JSON_SCHEMA, summaryPrompt, summaryResponseSchema } from './voting-summary';

// Montado en /api/ai detrás de requireAuth.
export function aiRouter({ db, ai, aiLimiter, now }: ResolvedDeps) {
  const router = Router();
  const calls = aiCallsRepository(db);

  // No llama a la IA: no pasa por el limitador ni se anota.
  router.get('/status', (_req, res) => {
    const body: AiStatus = { provider: ai.provider };
    res.json(body);
  });

  // El limitador va antes que la subida: una petición limitada no llega a leer los 5 MB.
  router.post('/schedule-ocr', aiLimiter, uploadScheduleImage, async (req, res) => {
    const file = req.file;
    if (!file) throw new ApiError(400, 'IMAGE_REQUIRED', 'Adjunta la foto de tu horario en el campo «image».');
    const items = await askAi(
      ai,
      { task: 'schedule-ocr', prompt: OCR_PROMPT, schema: OCR_JSON_SCHEMA, image: { data: file.buffer, mimeType: file.mimetype } },
      ocrResponseSchema,
      aiCallRecorder(calls, getUserId(res), now()),
    );
    const body: ScheduleOcrResult = { blocks: toOcrBlocks(items) };
    res.json(body);
  });

  return router;
}

// Montado en /api/groups detrás de requireAuth, después de groupsRouter y groupProposalsRouter.
export function groupAiRouter({ db, ai, aiLimiter, now }: ResolvedDeps) {
  const router = Router();
  const groups = groupsRepository(db);
  const blocks = timeBlocksRepository(db);
  const proposals = proposalsRepository(db);
  const calls = aiCallsRepository(db);

  router.post('/:id/ai/proposal-draft', aiLimiter, async (req, res) => {
    const userId = getUserId(res);
    const { group } = await loadGroupForMember(groups, String(req.params.id), userId);
    const { text } = proposalDraftInputSchema.parse(req.body);
    const windows = await commonWindows(group, blocks);
    const at = now();
    const answer = await askAi(
      ai,
      { task: 'proposal-draft', prompt: draftPrompt({ text, group, windows, now: at }), schema: DRAFT_JSON_SCHEMA },
      draftResponseSchema,
      aiCallRecorder(calls, userId, at),
    );
    const window = pickWindow(windows, answer.windowIndex);
    const draft: ProposalDraft = {
      title: answer.title,
      category: answer.category,
      placeName: answer.placeName,
      window,
      votingDeadline: draftDeadline(at, answer.deadlineHours, window),
    };
    res.json(draft);
  });

  router.post('/:id/ai/suggestions', aiLimiter, async (req, res) => {
    const userId = getUserId(res);
    const { group } = await loadGroupForMember(groups, String(req.params.id), userId);
    const windows = await commonWindows(group, blocks);
    // Las 5 propuestas más recientes, para que la IA no repita planes.
    const recentTitles = (await proposals.listByGroup(group.id, userId)).slice(0, 5).map((p) => p.title);
    const at = now();
    const ideas = await askAi(
      ai,
      { task: 'plan-suggestions', prompt: suggestionsPrompt({ group, windows, recentTitles, now: at }), schema: SUGGESTIONS_JSON_SCHEMA },
      suggestionsResponseSchema,
      aiCallRecorder(calls, userId, at),
    );
    const body: PlanSuggestions = {
      suggestions: ideas.map((idea) => ({
        title: idea.title,
        category: idea.category,
        placeIdea: idea.placeIdea,
        window: pickWindow(windows, idea.windowIndex),
        reason: idea.reason,
      })),
    };
    res.json(body);
  });

  return router;
}

// Montado en /api/proposals detrás de requireAuth, después de proposalsRouter.
export function proposalAiRouter({ db, ai, aiLimiter, now }: ResolvedDeps) {
  const router = Router();
  const groups = groupsRepository(db);
  const proposals = proposalsRepository(db);
  const calls = aiCallsRepository(db);

  // Solo lee: nunca confirma, cancela ni reprograma (lo decide quien organiza el plan, D9).
  router.post('/:id/ai/summary', aiLimiter, async (req, res) => {
    const userId = getUserId(res);
    const proposal = await proposals.findById(String(req.params.id), userId);
    if (!proposal) throw new ApiError(404, 'PROPOSAL_NOT_FOUND', 'Propuesta no encontrada.');
    const { group } = await loadGroupForMember(groups, proposal.groupId, userId);
    if (proposal.state === 'CANCELADO') {
      throw new ApiError(409, 'INVALID_STATE', 'Este plan está cancelado: no hay votación que resumir.');
    }
    const at = now();
    const body: VotingSummary = await askAi(
      ai,
      { task: 'voting-summary', prompt: summaryPrompt(proposal, group, at), schema: SUMMARY_JSON_SCHEMA },
      summaryResponseSchema,
      aiCallRecorder(calls, userId, at),
    );
    res.json(body);
  });

  return router;
}
