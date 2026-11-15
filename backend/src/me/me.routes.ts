import { Router } from 'express';

import type { ResolvedDeps } from '../app';
import { getUserId } from '../auth/require-auth';
import { buildDashboard, upcomingPlans } from '../dashboard/dashboard';
import { groupsRepository } from '../groups/groups.repository';
import { expressVotesRepository } from '../proposals/express-votes.repository';
import { proposalsRepository } from '../proposals/proposals.repository';
import { closeDueProposals } from '../proposals/voting-close';
import { timeBlocksRepository } from '../schedule/time-blocks.repository';

// Montado en /api/me detrás de requireAuth (/me/time-blocks tiene su propio router).
export function meRouter({ db, now }: ResolvedDeps) {
  const router = Router();
  const groups = groupsRepository(db);
  const proposals = proposalsRepository(db);
  const blocks = timeBlocksRepository(db);
  const expressVotes = expressVotesRepository(db);

  router.get('/upcoming-plans', async (_req, res) => {
    const userId = getUserId(res);
    // Cierre perezoso (nunca lanza): antes de leer se cierran las votaciones de franjas vencidas de mis grupos y después
    // las votaciones exprés vencidas.
    const at = now();
    await closeDueProposals(db, { userId }, at);
    await expressVotes.closeDueInScope({ userId }, at);
    res.json(upcomingPlans(await proposals.listForUser(userId), at));
  });

  router.get('/dashboard', async (_req, res) => {
    const userId = getUserId(res);
    const at = now();
    await closeDueProposals(db, { userId }, at);
    await expressVotes.closeDueInScope({ userId }, at);
    const myGroups = await groups.listForUser(userId);
    const myProposals = await proposals.listForUser(userId);
    const totalBlocks = (await blocks.listByUser(userId)).length;
    // buildDashboard es puro (síncrono): los miembros del próximo plan se leen antes, en una consulta.
    const next = upcomingPlans(myProposals, at)[0];
    const nextMembers = next ? ((await groups.findById(next.groupId))?.members ?? []) : [];
    res.json(
      buildDashboard({
        now: at,
        groups: myGroups,
        proposals: myProposals,
        totalBlocks,
        membersOf: (groupId) => (groupId === next?.groupId ? nextMembers : []),
      }),
    );
  });

  return router;
}
