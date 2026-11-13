import type { Group, Proposal, ProposalState, TimeWindowInput } from '@hueckoapp/shared';
import { Router } from 'express';

import type { ResolvedDeps } from '../app';
import { getUserId } from '../auth/require-auth';
import { groupWeekWindows, windowAvailability } from '../availability/group-availability';
import { instant } from '../common/zone';
import { isForeignKeyViolation } from '../db/errors';
import { groupNotFound, loadGroupForMember } from '../groups/group-access';
import { groupsRepository } from '../groups/groups.repository';
import { ApiError } from '../middleware/errors';
import { timeBlocksRepository } from '../schedule/time-blocks.repository';
import { criticalReasonFor } from './express-rules';
import { type CloseScope, expressVotesRepository, logCloseError } from './express-votes.repository';
import { proposalsRepository } from './proposals.repository';
import {
  assertDeadlineBeforeWindows,
  confirmSchema,
  createProposalSchema,
  expressVoteInputSchema,
  incidenceInputSchema,
  overlaps,
  replanSchema,
  timeWindowInputSchema,
  validationError,
  voteSchema,
  WINDOW_LIMITS,
} from './proposals.schemas';
import { bestWindows, canCancel, criticalityFor, isVotingOpen, pickWinner, scheduleFor } from './rules';

// Repositorios, reloj y comprobaciones de acceso que comparten los dos routers.
function proposalsContext({ db, now, expressVoteMinutes }: ResolvedDeps) {
  const groups = groupsRepository(db);
  const proposals = proposalsRepository(db);
  const blocks = timeBlocksRepository(db);
  const expressVotes = expressVotesRepository(db);

  // Cierre perezoso de la votación exprés: antes de leer, se cierran las vencidas del alcance (nunca lanza).
  const closeDue = (scope: CloseScope) => expressVotes.closeDueInScope(scope, now());

  const proposalNotFound = () => new ApiError(404, 'PROPOSAL_NOT_FOUND', 'Propuesta no encontrada.');

  // 404 si la propuesta no existe; 403 si no soy miembro de su grupo.
  const loadForMember = async (proposalId: string, userId: string) => {
    const proposal = await proposals.findById(proposalId, userId);
    if (!proposal) throw proposalNotFound();
    const { group, me } = await loadGroupForMember(groups, proposal.groupId, userId);
    return { proposal, group, me };
  };

  // Como loadForMember, pero si su votación exprés ya venció la cierra (y aplica su resultado) antes de devolver el
  // plan, que se vuelve a leer. Primero el acceso: quien no es miembro no dispara nada. Un cierre que falla se anota y
  // la petición sigue con la votación aún abierta (la siguiente lectura lo reintenta).
  const loadForMemberClosingDue = async (proposalId: string, userId: string) => {
    const loaded = await loadForMember(proposalId, userId);
    const vote = loaded.proposal.expressVote;
    const at = now();
    if (vote?.status !== 'ABIERTA' || new Date(vote.expiresAt).getTime() > at.getTime()) return loaded;
    await expressVotes.closeDue(proposalId, at).catch((error: unknown) => logCloseError(proposalId, error));
    const proposal = await proposals.findById(proposalId, userId);
    if (!proposal) throw proposalNotFound();
    return { ...loaded, proposal };
  };

  // % de cada franja con los horarios actuales del grupo: los recurrentes de su día y los puntuales de su fecha.
  const withAvailability = async (group: Group, windows: readonly TimeWindowInput[]) => {
    const memberIds = group.members.map((m) => m.id);
    const dates = windows.map((w) => w.date).sort();
    const groupBlocks = await blocks.listForUsersInRange(memberIds, dates[0], dates[dates.length - 1]);
    const matcherGroup = { memberIds, availabilityThreshold: group.availabilityThreshold };
    return windows.map((w) => ({
      date: w.date,
      startTime: w.startTime,
      endTime: w.endTime,
      availabilityPercentage: windowAvailability(matcherGroup, groupBlocks, w),
    }));
  };

  const assertVotingOpen = (proposal: Proposal) => {
    if (!isVotingOpen(proposal, now())) throw new ApiError(409, 'VOTING_CLOSED', 'La votación ya cerró.');
  };

  return {
    groups, proposals, blocks, expressVotes, expressVoteMinutes, now, closeDue, loadForMember, loadForMemberClosingDue, withAvailability, assertVotingOpen,
  };
}

// Montado en /api/groups detrás de requireAuth (junto a groupsRouter).
export function groupProposalsRouter(deps: ResolvedDeps) {
  const router = Router();
  const ctx = proposalsContext(deps);

  router.get('/:id/proposals', async (req, res) => {
    const userId = getUserId(res);
    const { group } = await loadGroupForMember(ctx.groups, req.params.id, userId);
    await ctx.closeDue({ groupId: group.id });
    res.json(await ctx.proposals.listByGroup(group.id, userId));
  });

  router.post('/:id/proposals', async (req, res) => {
    const userId = getUserId(res);
    const { group } = await loadGroupForMember(ctx.groups, req.params.id, userId);
    const now = ctx.now();
    const input = createProposalSchema(now).parse(req.body);
    // Con franjas: el % lo calcula el servidor (G2). Sin franjas: las 3 mejores de la semana `week` (C5) entre las que
    // empiezan después del plazo (así nunca elige una que el plazo deja fuera; tampoco las que ya empezaron).
    const deadlineAt = new Date(input.votingDeadline).getTime();
    const windows = input.windows
      ? await ctx.withAvailability(group, input.windows)
      : bestWindows(
          (await groupWeekWindows(group, ctx.blocks, input.week, now)).filter((w) => instant(w.date, w.startTime).getTime() > deadlineAt),
        ).map(({ date, startTime, endTime, availabilityPercentage }) => ({ date, startTime, endTime, availabilityPercentage }));
    // Sin al menos 2 huecos en común no se crea el plan: con menos no hay nada que elegir.
    if (windows.length < WINDOW_LIMITS.min) {
      throw new ApiError(409, 'NO_COMMON_WINDOWS', 'El grupo no tiene huecos en común esta semana: elige las franjas a mano.');
    }
    assertDeadlineBeforeWindows(input.votingDeadline, windows);
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

const windowNotFound = () => new ApiError(404, 'WINDOW_NOT_FOUND', 'Esa franja no existe en esta propuesta.');

// Montado en /api/proposals detrás de requireAuth.
export function proposalsRouter(deps: ResolvedDeps) {
  const router = Router();
  const ctx = proposalsContext(deps);

  router.get('/:id', async (req, res) => {
    res.json((await ctx.loadForMemberClosingDue(req.params.id, getUserId(res))).proposal);
  });

  router.put('/:id/vote', async (req, res) => {
    const userId = getUserId(res);
    const { proposal } = await ctx.loadForMember(req.params.id, userId);
    const { windowId } = voteSchema.parse(req.body);
    ctx.assertVotingOpen(proposal);
    if (!proposal.windows.some((w) => w.id === windowId)) throw windowNotFound();
    // Si un replanteo borró la franja justo ahora, su clave foránea falla: 404 como si no existiera.
    await ctx.proposals.vote(proposal.id, userId, windowId, ctx.now().toISOString()).catch((error: unknown) => {
      throw isForeignKeyViolation(error, 'votes_window_id_proposal_id_fkey') ? windowNotFound() : error;
    });
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
    const input: TimeWindowInput = timeWindowInputSchema(ctx.now()).parse(req.body);
    ctx.assertVotingOpen(proposal);
    const exists = proposal.windows.some((w) => w.date === input.date && w.startTime === input.startTime && w.endTime === input.endTime);
    if (exists) throw new ApiError(409, 'WINDOW_EXISTS', 'Esa franja ya está propuesta.');
    if (proposal.windows.some((w) => overlaps(w, input))) throw validationError(['startTime'], 'Hay franjas que se solapan el mismo día');
    if (proposal.windows.length >= WINDOW_LIMITS.max) throw validationError([], `Máximo ${WINDOW_LIMITS.max} franjas`);
    // Como al crear: no se añade una opción que empiece antes de que cierre la votación.
    if (instant(input.date, input.startTime).getTime() <= new Date(proposal.votingDeadline).getTime()) {
      throw validationError(['startTime'], 'La franja debe empezar después del cierre de la votación');
    }
    const [window] = await ctx.withAvailability(group, [input]);
    await ctx.proposals.addWindow(proposal.id, window);
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

  router.post('/:id/confirm', async (req, res) => {
    const userId = getUserId(res);
    const { proposal } = await loadForManager(req.params.id, userId);
    const { windowId } = confirmSchema.parse(req.body ?? {});
    if (proposal.state !== 'PROPUESTO') throw invalidState();
    const chosen = windowId !== undefined ? proposal.windows.find((w) => w.id === windowId) : pickWinner(proposal.windows);
    if (!chosen && windowId !== undefined) throw windowNotFound();
    if (!chosen) throw new ApiError(409, 'NO_VOTES', 'Nadie ha votado todavía: elige la franja para confirmar.');
    // Un plan no se confirma para una franja que ya empezó (o pasó): hay que replantearlo con franjas nuevas.
    if (instant(chosen.date, chosen.startTime).getTime() <= ctx.now().getTime()) {
      throw new ApiError(409, 'WINDOW_STARTED', 'Esa franja ya empezó: replantea la propuesta.');
    }
    const { scheduledAt, scheduledDate } = scheduleFor(chosen.date, chosen.startTime);
    if (!(await ctx.proposals.confirm(proposal.id, chosen.id, scheduledAt, scheduledDate))) throw invalidState();
    res.json(await ctx.proposals.findById(proposal.id, userId));
  });

  router.post('/:id/cancel', async (req, res) => {
    const userId = getUserId(res);
    const { proposal } = await loadForManager(req.params.id, userId);
    if (!canCancel(proposal.state)) throw invalidState();
    if (!(await ctx.proposals.cancel(proposal.id))) throw invalidState();
    res.json(await ctx.proposals.findById(proposal.id, userId));
  });

  // Una franja confirmada que ya terminó: no hay plan al que faltar.
  const hasEnded = (p: Proposal) => {
    const chosen = p.windows.find((w) => w.id === p.chosenWindowId);
    return chosen !== undefined && instant(chosen.date, chosen.endTime).getTime() <= ctx.now().getTime();
  };

  router.post('/:id/incidences', async (req, res) => {
    const userId = getUserId(res);
    // Primero se cierra una votación vencida: su resultado puede haber cambiado el estado del plan.
    const { proposal, me } = await ctx.loadForMemberClosingDue(req.params.id, userId);
    const input = incidenceInputSchema.parse(req.body);
    const notConfirmed = () => new ApiError(409, 'INVALID_STATE', 'Solo se pueden reportar imprevistos de un plan confirmado.');
    if (proposal.state !== 'CONFIRMADO' || hasEnded(proposal)) throw notConfirmed();
    // Ausencia crítica (quien propuso el plan, imprescindible u organizador): ALTA y abre la votación del grupo.
    const criticalReason = criticalReasonFor({
      type: input.type, reporterId: userId, createdById: proposal.createdBy.id, isEssential: me.isEssential, role: me.role,
    });
    const criticality = criticalReason !== null ? 'ALTA' : criticalityFor(input.type, me.isEssential, input.delayMinutes);
    // El estado se vuelve a comprobar con el plan bloqueado (otra petición pudo cambiarlo mientras tanto).
    const { saved } = await ctx.proposals.reportIncidence(
      proposal.id,
      { userId, ...input, criticality, criticalReason, createdAt: ctx.now().toISOString() },
      ctx.expressVoteMinutes,
    );
    if (!saved) throw notConfirmed();
    res.status(201).json(await ctx.proposals.findById(proposal.id, userId));
  });

  // Votación exprés: un voto por votante, se puede cambiar mientras siga abierta. Si con él ya votaron todos, cierra.
  router.put('/:id/express-vote', async (req, res) => {
    const userId = getUserId(res);
    const { proposal } = await ctx.loadForMemberClosingDue(req.params.id, userId);
    const { option } = expressVoteInputSchema.parse(req.body);
    const vote = proposal.expressVote;
    const closed = () => new ApiError(409, 'VOTING_CLOSED', 'La votación ya cerró.');
    // Sin votación abierta, o vencida (si su cierre falló arriba, sigue ABIERTA pero ya no admite votos).
    if (!vote || vote.status !== 'ABIERTA' || new Date(vote.expiresAt).getTime() <= ctx.now().getTime()) throw closed();
    // canVote: está en la lista fijada al abrir (quien avisó no) y sigue en el grupo.
    if (!vote.canVote) throw new ApiError(403, 'NOT_A_VOTER', 'No puedes votar en esta votación.');
    if (!(await ctx.expressVotes.castVoteIfOpen(vote.id, userId, option, ctx.now()))) throw closed();
    // Cierre anticipado; si falla, el voto ya quedó guardado y la votación se cierra al vencer.
    await ctx.expressVotes.closeDue(proposal.id, ctx.now()).catch((error: unknown) => logCloseError(proposal.id, error));
    res.json(await ctx.proposals.findById(proposal.id, userId));
  });

  // Replantear: con la propuesta en votación (o en recoordinación tras una votación exprés), quien la gestiona la
  // reemplaza por franjas y plazo nuevos y vuelve a PROPUESTO (se borran los votos). Sin cierre perezoso: una votación
  // exprés solo se abre con el plan CONFIRMADO, así que en estos estados no puede haber una ABIERTA.
  const REPLANNABLE: ProposalState[] = ['PROPUESTO', 'EN_RECOORDINACION'];
  router.post('/:id/replan', async (req, res) => {
    const userId = getUserId(res);
    const { proposal, group } = await loadForManager(req.params.id, userId);
    const input = replanSchema(ctx.now()).parse(req.body);
    if (!REPLANNABLE.includes(proposal.state)) throw invalidState();
    assertDeadlineBeforeWindows(input.votingDeadline, input.windows);
    const windows = await ctx.withAvailability(group, input.windows);
    const deadline = new Date(input.votingDeadline).toISOString();
    if (!(await ctx.proposals.replanWindows(proposal.id, windows, deadline, REPLANNABLE))) throw invalidState();
    res.json(await ctx.proposals.findById(proposal.id, userId));
  });

  return router;
}
