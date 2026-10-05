import { Router } from 'express';

import type { AppDeps } from '../app';
import { getUserId } from '../auth/require-auth';
import { ApiError } from '../middleware/errors';
import { timeBlocksRepository } from './time-blocks.repository';
import { bulkTimeBlocksSchema, timeBlockInputSchema } from './time-blocks.schemas';

// Se monta detrás de requireAuth: el dueño de cada bloque sale siempre del token.
export function timeBlocksRouter({ db }: AppDeps) {
  const router = Router();
  const blocks = timeBlocksRepository(db);

  router.get('/', async (_req, res) => {
    res.json(await blocks.listByUser(getUserId(res)));
  });

  router.post('/', async (req, res) => {
    const input = timeBlockInputSchema.parse(req.body);
    res.status(201).json(await blocks.create(getUserId(res), input));
  });

  router.post('/bulk', async (req, res) => {
    const { blocks: inputs } = bulkTimeBlocksSchema.parse(req.body);
    res.status(201).json(await blocks.createMany(getUserId(res), inputs));
  });

  router.delete('/:id', async (req, res) => {
    if (!(await blocks.delete(getUserId(res), req.params.id))) {
      throw new ApiError(404, 'TIME_BLOCK_NOT_FOUND', 'Bloque no encontrado.');
    }
    res.status(204).end();
  });

  return router;
}
