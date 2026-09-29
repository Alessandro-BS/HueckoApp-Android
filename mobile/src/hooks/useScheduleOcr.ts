import { useCallback } from 'react';

import { scanSchedule, type OcrImage } from '../api/ai';
import { useResource } from './useResource';

// Lee la foto del horario al montar (OcrReview). `image` debe ser estable (sale de los parámetros de la ruta).
export function useScheduleOcr(image: OcrImage) {
  const load = useCallback(() => scanSchedule(image), [image]);
  const { data, loading, error, reload } = useResource(load);
  return { blocks: data?.blocks, loading, error, retry: reload };
}
