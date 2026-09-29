import type { Group, Proposal, TimeWindowInput } from '@hueckoapp/shared';
import { Router } from 'express';

import type { ResolvedDeps } from '../app';
import { getUserId } from '../auth/require-auth';
import { groupAvailability, windowAvailability } from '../availability/group-availability';
import { loadGroupForMember } from '../groups/group-access';
import { groupsRepository } from '../groups/groups.repository';
import { ApiError } from '../middleware/errors';
import { timeBlocksRepository } from '../schedule/time-blocks.repository';
import { proposalsRepository } from './proposals.repository';
import { createProposalSchema, timeWindowInputSchema, voteSchema } from './proposals.schemas';
import { bestWindows, isVotingOpen } from './rules';

// Repositorios, reloj y comprobaciones de acceso que comparten los dos routers.
function proposalsContext({ db, now }: ResolvedDeps) {
  const groups = groupsRepository(db);
  const proposals = proposalsRepository(db);
  const blocks = timeBlocksRepository(db);

  // 404 si la propuesta no existe; 403 si no soy miembro de su grupo.
  const loadForMember = (proposalId: string, userId: string) => {
    const proposal = proposals.findById(proposalId, userId);
    if (!proposal) throw new ApiError(404, 'PROPOSAL_NOT_FOUND', 'Propuesta no encontrada.');
    const { group, me } = loadGroupForMember(groups, proposal.groupId, userId);
    return { proposal, group, me };
  };

  // Datos del cruce del grupo con sus horarios actuales.
  const matcherInput = (group: Group) => {
    const memberIds = group.members.map((m) => m.id);
    return { matcherGroup: { memberIds, availabilityThreshold: group.availabilityThreshold }, groupBlocks: blocks.listRecurringByUsers(memberIds) };
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

  router.get('/:id/proposals', (req, res) => {
    const userId = getUserId(res);
    const { group } = loadGroupForMember(ctx.groups, req.params.id, userId);
    res.json(ctx.proposals.listByGroup(group.id, userId));
  });

  router.post('/:id/proposals', (req, res) => {
    const userId = getUserId(res);
    const { group } = loadGroupForMember(ctx.groups, req.params.id, userId);
    const now = ctx.now();
    const input = createProposalSchema(now).parse(req.body);
    const { matcherGroup, groupBlocks } = ctx.matcherInput(group);
    // Con franjas: el % lo calcula el servidor (G2). Sin franjas: las 3 mejores del cruce del grupo (C5).
    const windows =
      input.windows.length > 0
        ? input.windows.map((w) => ({ ...w, availabilityPercentage: windowAvailability(matcherGroup, groupBlocks, w) }))
        : bestWindows(groupAvailability(matcherGroup, groupBlocks)).map(({ dayOfWeek, startTime, endTime, availabilityPercentage }) => ({
            dayOfWeek, startTime, endTime, availabilityPercentage,
          }));
    const id = ctx.proposals.create({
      groupId: group.id,
      createdBy: userId,
      title: input.title,
      location: input.location,
      votingDeadline: new Date(input.votingDeadline).toISOString(),
      windows,
      createdAt: now.toISOString(),
    });
    res.status(201).json(ctx.proposals.findById(id, userId));
  });

  return router;
}

// Montado en /api/proposals detrás de requireAuth.
export function proposalsRouter(deps: ResolvedDeps) {
  const router = Router();
  const ctx = proposalsContext(deps);

  router.get('/:id', (req, res) => {
    res.json(ctx.loadForMember(req.params.id, getUserId(res)).proposal);
  });

  router.put('/:id/vote', (req, res) => {
    const userId = getUserId(res);
    const { proposal } = ctx.loadForMember(req.params.id, userId);
    const { windowId } = voteSchema.parse(req.body);
    ctx.assertVotingOpen(proposal);
    if (!proposal.windows.some((w) => w.id === windowId)) {
      throw new ApiError(404, 'WINDOW_NOT_FOUND', 'Esa franja no existe en esta propuesta.');
    }
    ctx.proposals.vote(proposal.id, userId, windowId, ctx.now().toISOString());
    res.json(ctx.proposals.findById(proposal.id, userId));
  });

  router.delete('/:id/vote', (req, res) => {
    const userId = getUserId(res);
    const { proposal } = ctx.loadForMember(req.params.id, userId);
    ctx.assertVotingOpen(proposal);
    ctx.proposals.unvote(proposal.id, userId);
    res.json(ctx.proposals.findById(proposal.id, userId));
  });

  router.post('/:id/windows', (req, res) => {
    const userId = getUserId(res);
    const { proposal, group } = ctx.loadForMember(req.params.id, userId);
    const input: TimeWindowInput = timeWindowInputSchema.parse(req.body);
    ctx.assertVotingOpen(proposal);
    const exists = proposal.windows.some(
      (w) => w.dayOfWeek === input.dayOfWeek && w.startTime === input.startTime && w.endTime === input.endTime,
    );
    if (exists) throw new ApiError(409, 'WINDOW_EXISTS', 'Esa franja ya está propuesta.');
    const { matcherGroup, groupBlocks } = ctx.matcherInput(group);
    ctx.proposals.addWindow(proposal.id, { ...input, availabilityPercentage: windowAvailability(matcherGroup, groupBlocks, input) });
    res.status(201).json(ctx.proposals.findById(proposal.id, userId));
  });

  return router;
}
