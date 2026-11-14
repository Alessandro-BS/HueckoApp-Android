import type { MatchWindow } from '@hueckoapp/shared';
import { useCallback } from 'react';

import { getAvailability } from '../api/groups';
import { queryKeys } from '../api/queryClient';
import { useApiQuery } from './useApiQuery';

const NO_WINDOWS: MatchWindow[] = [];

// Huecos en común del grupo (calculados en el servidor).
// `week` = lunes de la semana pedida; cambiarla vuelve a cargar.
export function useAvailability(groupId: string, week?: string) {
  const load = useCallback(() => getAvailability(groupId, week), [groupId, week]);
  const { data, loaded, loading, refreshing, error, reload } = useApiQuery(queryKeys.availability(groupId, week), load);
  return { windows: data ?? NO_WINDOWS, loaded, loading, refreshing, error, reload };
}
