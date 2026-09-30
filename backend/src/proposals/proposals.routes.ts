import type { Group, Proposal, TimeWindowInput } from '@hueckoapp/shared';
import { Router } from 'express';

import type { ResolvedDeps } from '../app';
import { getUserId } from '../auth/require-auth';
import { groupAvailability, windowAvailability } from '../availability/group-availability';
import { isForeignKeyViolation } from '../db/errors';
import { groupNotFound, loadGroupForMember } from '../groups/group-access';
import { groupsRepository } from '../groups/groups.repository';
import { ApiError } from '../middleware/errors';
import { timeBlocksRepository } from '../schedule/time-blocks.repository';
import { proposalsRepository } from './proposals.repository';
import { confirmSchema, createProposalSchema, incidenceInputSchema, resolveIncidencesSchema, timeWindowInputSchema, voteSchema } from './proposals.schemas';
import { bestWindows, canCancel, criticalityFor, isVotingOpen, pickWinner, scheduleFor } from './rules';

// Repositorios, reloj y comprobaciones de acceso que comparten los dos routers.
function proposalsContext({ db, now }: ResolvedDeps) {
  const groups = groupsRepository(db);
  const proposals = proposalsRepository(db);
  const blocks = timeBlocksRepository(db);

  // 404 si la propuesta no existe; 403 si no soy miembro de su grupo.
  const loadForMember = async (proposalId: string, userId: string) => {
    const proposal = await proposals.findById(proposalId, userId);
    if (!proposal) throw new ApiError(404, 'PROPOSAL_NOT_FOUND', 'Propuesta no encontrada.');
    const { group, me } = await loadGroupForMember(groups, proposal.groupId, userId);
    return { proposal, group, me };
  };

  // Datos del cruce del grupo con sus horarios actuales.
  const matcherInput = async (group: Group) => {
    const memberIds = group.members.map((m) => m.id);
    return {
      matcherGroup: { memberIds, availabilityThreshold: group.availabilityThreshold },
      groupBlocks: await blocks.listRecurringByUsers(memberIds),
    };
  };

  const assertVotingOpen = (proposal: Proposal) => {
    if (!isVotingOpen(proposal, now())) throw new ApiError(409, 'VOTING_CLOSED', 'La votación ya cerró.');
  };

  return { groups, proposals, now, loadForMember, matcherInput, assertVotingOpen };
}

// Montado en /api/groups detrás de requireAuth (junto a groupsRouter).
export function groupProposalsRouter(deps: ResolvedDeps) {
  const router = Router();
  const ctx = proposalsContext(deps);

  router.get('/:id/proposals', async (req, res) => {
    const userId = getUserId(res);
    const { group } = await loadGroupForMember(ctx.groups, req.params.id, userId);
    res.json(await ctx.proposals.listByGroup(group.id, userId));
  });

  router.post('/:id/proposals', async (req, res) => {
    const userId = getUserId(res);
    const { group } = await loadGroupForMember(ctx.groups, req.params.id, userId);
    const now = ctx.now();
    const input = createProposalSchema(now).parse(req.body);
    const { matcherGroup, groupBlocks } = await ctx.matcherInput(group);
    // Con franjas: el % lo calcula el servidor (G2). Sin franjas: las 3 mejores del cruce del grupo (C5).
    const windows =
      input.windows.length > 0
        ? input.windows.map((w) => ({ ...w, availabilityPercentage: windowAvailability(matcherGroup, groupBlocks, w) }))
        : bestWindows(groupAvailability(matcherGroup, groupBlocks)).map(({ dayOfWeek, startTime, endTime, availabilityPercentage }) => ({
            dayOfWeek, startTime, endTime, availabilityPercentage,
          }));
    // Sin franjas y sin ningún hueco en común no se crea un plan vacío (sin nada que votar).
    if (windows.length === 0) {
      throw new ApiError(409, 'NO_COMMON_WINDOWS', 'El grupo no tiene huecos en común esta semana: elige las franjas a mano.');
    }
    // Si el grupo se borró justo ahora (se fue su último miembro), su clave foránea falla: 404 como si no existiera.
    const id = await ctx.proposals
      .create({
        groupId: group.id,
        createdBy: userId,
        title: input.title,
        location: input.location,
        votingDeadline: new Date(input.votingDeadline).toISOString(),
        windows,
        createdAt: now.toISOString(),
      })
      .catch((error: unknown) => {
        throw isForeignKeyViolation(error, 'proposals_group_id_fkey') ? groupNotFound() : error;
      });
    res.status(201).json(await ctx.proposals.findById(id, userId));
  });

  return router;
}

// Montado en /api/proposals detrás de requireAuth.
export function proposalsRouter(deps: ResolvedDeps) {
  const router = Router();
  const ctx = proposalsContext(deps);

  router.get('/:id', async (req, res) => {
    res.json((await ctx.loadForMember(req.params.id, getUserId(res))).proposal);
  });

  router.put('/:id/vote', async (req, res) => {
    const userId = getUserId(res);
    const { proposal } = await ctx.loadForMember(req.params.id, userId);
    const { windowId } = voteSchema.parse(req.body);
    ctx.assertVotingOpen(proposal);
    if (!proposal.windows.some((w) => w.id === windowId)) {
      throw new ApiError(404, 'WINDOW_NOT_FOUND', 'Esa franja no existe en esta propuesta.');
    }
    await ctx.proposals.vote(proposal.id, userId, windowId, ctx.now().toISOString());
    res.json(await ctx.proposals.findById(proposal.id, userId));
  });

  router.delete('/:id/vote', async (req, res) => {
    const userId = getUserId(res);
    const { proposal } = await ctx.loadForMember(req.params.id, userId);
    ctx.assertVotingOpen(proposal);
    await ctx.proposals.unvote(proposal.id, userId);
    res.json(await ctx.proposals.findById(proposal.id, userId));
  });

  router.post('/:id/windows', async (req, res) => {
    const userId = getUserId(res);
    const { proposal, group } = await ctx.loadForMember(req.params.id, userId);
    const input: TimeWindowInput = timeWindowInputSchema.parse(req.body);
    ctx.assertVotingOpen(proposal);
    const exists = proposal.windows.some(
      (w) => w.dayOfWeek === input.dayOfWeek && w.startTime === input.startTime && w.endTime === input.endTime,
    );
    if (exists) throw new ApiError(409, 'WINDOW_EXISTS', 'Esa franja ya está propuesta.');
    const { matcherGroup, groupBlocks } = await ctx.matcherInput(group);
    await ctx.proposals.addWindow(proposal.id, { ...input, availabilityPercentage: windowAvailability(matcherGroup, groupBlocks, input) });
    res.status(201).json(await ctx.proposals.findById(proposal.id, userId));
  });

  // Solo quien gestiona la propuesta decide sobre ella (canManageProposal: su creador; si se fue, el OWNER; si no, el más antiguo).
  const loadForManager = async (proposalId: string, userId: string) => {
    const loaded = await ctx.loadForMember(proposalId, userId);
    if (!loaded.proposal.canManage) {
      throw new ApiError(403, 'NOT_MANAGER', 'Solo quien organiza el plan puede hacer esto.');
    }
    return loaded;
  };
  const invalidState = () => new ApiError(409, 'INVALID_STATE', 'El plan no admite esta acción en su estado actual.');
  const isActivePlan = (p: Proposal) => p.state === 'CONFIRMADO' || p.state === 'EN_RECOORDINACION';

  router.post('/:id/confirm', async (req, res) => {
    const userId = getUserId(res);
    const { proposal } = await loadForManager(req.params.id, userId);
    const { windowId } = confirmSchema.parse(req.body ?? {});
    if (proposal.state !== 'PROPUESTO') throw invalidState();
    const chosen = windowId !== undefined ? proposal.windows.find((w) => w.id === windowId) : pickWinner(proposal.windows);
    if (!chosen && windowId !== undefined) throw new ApiError(404, 'WINDOW_NOT_FOUND', 'Esa franja no existe en esta propuesta.');
    if (!chosen) throw new ApiError(409, 'NO_VOTES', 'Nadie ha votado todavía: elige la franja para confirmar.');
    const { scheduledAt, scheduledDate } = scheduleFor(chosen.dayOfWeek, chosen.startTime, ctx.now());
    await ctx.proposals.confirm(proposal.id, chosen.id, scheduledAt, scheduledDate);
    res.json(await ctx.proposals.findById(proposal.id, userId));
  });

  router.post('/:id/cancel', async (req, res) => {
    const userId = getUserId(res);
    const { proposal } = await loadForManager(req.params.id, userId);
    if (!canCancel(proposal.state)) throw invalidState();
    await ctx.proposals.setState(proposal.id, 'CANCELADO');
    res.json(await ctx.proposals.findById(proposal.id, userId));
  });

  router.post('/:id/incidences', async (req, res) => {
    const userId = getUserId(res);
    const { proposal, me } = await ctx.loadForMember(req.params.id, userId);
    const input = incidenceInputSchema.parse(req.body);
    if (!isActivePlan(proposal)) {
      throw new ApiError(409, 'INVALID_STATE', 'Solo se pueden reportar imprevistos de un plan confirmado.');
    }
    // Contrato + G5: si falta un imprescindible, el plan confirmado pasa a re-coordinarse.
    const escalate = input.type === 'FALTA' && me.isEssential && proposal.state === 'CONFIRMADO';
    await ctx.proposals.reportIncidence(
      proposal.id,
      { userId, ...input, criticality: criticalityFor(input.type, me.isEssential, input.delayMinutes), createdAt: ctx.now().toISOString() },
      escalate,
    );
    res.status(201).json(await ctx.proposals.findById(proposal.id, userId));
  });

  router.post('/:id/incidences/resolve', async (req, res) => {
    const userId = getUserId(res);
    const { proposal } = await loadForManager(req.params.id, userId);
    const input = resolveIncidencesSchema(ctx.now()).parse(req.body);
    if (!isActivePlan(proposal)) throw invalidState();
    await ctx.proposals.resolveIncidences(proposal.id, input.newState, input.votingDeadline);
    res.json(await ctx.proposals.findById(proposal.id, userId));
  });

  return router;
}
