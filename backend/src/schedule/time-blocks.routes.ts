import type { TimeBlock } from '@hueckoapp/shared';
import { Router } from 'express';

import type { AppDeps } from '../app';
import { getUserId } from '../auth/require-auth';
import { ApiError } from '../middleware/errors';
import { overlapMessage } from './block-overlap';
import { timeBlocksRepository } from './time-blocks.repository';
import { bulkTimeBlocksSchema, timeBlockInputSchema } from './time-blocks.schemas';

const overlapError = (other: TimeBlock, details: Record<string, unknown>) =>
  new ApiError(409, 'TIME_BLOCK_OVERLAP', overlapMessage(other), details);

// Se monta detrás de requireAuth: el dueño de cada bloque sale siempre del token.
export function timeBlocksRouter({ db }: AppDeps) {
  const router = Router();
  const blocks = timeBlocksRepository(db);

  router.get('/', async (_req, res) => {
    res.json(await blocks.listByUser(getUserId(res)));
  });

  router.post('/', async (req, res) => {
    const input = timeBlockInputSchema.parse(req.body);
    const created = await blocks.create(getUserId(res), input);
    if ('overlap' in created) throw overlapError(created.overlap, { blockId: created.overlap.id });
    res.status(201).json(created);
  });

  router.post('/bulk', async (req, res) => {
    const { blocks: inputs } = bulkTimeBlocksSchema.parse(req.body);
    const created = await blocks.createMany(getUserId(res), inputs);
    if (!Array.isArray(created)) {
      const path = ['blocks', created.index];
      if ('overlap' in created) throw overlapError(created.overlap, { path, blockId: created.overlap.id });
      throw overlapError(inputs[created.otherIndex] as TimeBlock, { path, otherIndex: created.otherIndex });
    }
    res.status(201).json(created);
  });

  router.put('/:id', async (req, res) => {
    const input = timeBlockInputSchema.parse(req.body);
    const updated = await blocks.update(getUserId(res), req.params.id, input);
    if (!updated) throw new ApiError(404, 'TIME_BLOCK_NOT_FOUND', 'Bloque no encontrado.');
    if ('overlap' in updated) throw overlapError(updated.overlap, { blockId: updated.overlap.id });
    res.json(updated);
  });

  router.delete('/:id', async (req, res) => {
    if (!(await blocks.delete(getUserId(res), req.params.id))) {
      throw new ApiError(404, 'TIME_BLOCK_NOT_FOUND', 'Bloque no encontrado.');
    }
    res.status(204).end();
  });

  return router;
}
