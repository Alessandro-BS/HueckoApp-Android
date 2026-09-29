import { Router } from 'express';

import type { AppDeps } from '../app';
import { getUserId } from '../auth/require-auth';
import { buildDashboard, upcomingPlans } from '../dashboard/dashboard';
import { groupsRepository } from '../groups/groups.repository';
import { proposalsRepository } from '../proposals/proposals.repository';
import { timeBlocksRepository } from '../schedule/time-blocks.repository';

// Montado en /api/me detrás de requireAuth (/me/time-blocks tiene su propio router).
export function meRouter({ db, now = () => new Date() }: AppDeps) {
  const router = Router();
  const groups = groupsRepository(db);
  const proposals = proposalsRepository(db);
  const blocks = timeBlocksRepository(db);

  router.get('/upcoming-plans', (_req, res) => {
    const userId = getUserId(res);
    res.json(upcomingPlans(proposals.listForUser(userId), now()));
  });

  router.get('/dashboard', (_req, res) => {
    const userId = getUserId(res);
    res.json(
      buildDashboard({
        userId,
        now: now(),
        groups: groups.listForUser(userId),
        proposals: proposals.listForUser(userId),
        totalBlocks: blocks.listByUser(userId).length,
        membersOf: (groupId) => groups.findById(groupId)?.members ?? [],
      }),
    );
  });

  return router;
}
