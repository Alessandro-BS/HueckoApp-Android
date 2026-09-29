import type { AiStatus, ScheduleOcrResult } from '@hueckoapp/shared';
import { Router } from 'express';

import type { ResolvedDeps } from '../app';
import { ApiError } from '../middleware/errors';
import { askAi } from './ask-ai';
import { OCR_JSON_SCHEMA, OCR_PROMPT, ocrResponseSchema, toOcrBlocks } from './schedule-ocr';
import { uploadScheduleImage } from './upload';

// Montado en /api/ai detrás de requireAuth.
export function aiRouter({ ai, aiLimiter }: ResolvedDeps) {
  const router = Router();

  // No llama a la IA: no pasa por el limitador.
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
    );
    const body: ScheduleOcrResult = { blocks: toOcrBlocks(items) };
    res.json(body);
  });

  return router;
}
