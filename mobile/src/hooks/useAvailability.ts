import type { MatchWindow } from '@hueckoapp/shared';
import { useCallback } from 'react';

import { getAvailability } from '../api/groups';
import { useResource } from './useResource';

const NO_WINDOWS: MatchWindow[] = [];

// Huecos en común del grupo (calculados en el servidor).
// `week` = lunes de la semana pedida; cambiarla vuelve a cargar.
export function useAvailability(groupId: string, week?: string) {
  const load = useCallback(() => getAvailability(groupId, week), [groupId, week]);
  const { data, loaded, loading, refreshing, error, reload } = useResource(load);
  return { windows: data ?? NO_WINDOWS, loaded, loading, refreshing, error, reload };
}
