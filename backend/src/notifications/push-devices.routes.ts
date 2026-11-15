import { Router } from 'express';

import type { ResolvedDeps } from '../app';
import { getUserId } from '../auth/require-auth';
import { devicesRepository } from './devices.repository';
import { pushDeviceInputSchema } from './notifications.schemas';

// Se monta detrás de requireAuth: el dueño del token sale siempre del JWT.
export function pushDevicesRouter({ db, now }: Pick<ResolvedDeps, 'db' | 'now'>) {
  const router = Router();
  const devices = devicesRepository(db);

  router.put('/', async (req, res) => {
    const { token } = pushDeviceInputSchema.parse(req.body);
    await devices.upsert(getUserId(res), token, now());
    res.status(204).end();
  });

  router.delete('/:token', async (req, res) => {
    await devices.remove(getUserId(res), req.params.token);
    res.status(204).end();
  });

  return router;
}
