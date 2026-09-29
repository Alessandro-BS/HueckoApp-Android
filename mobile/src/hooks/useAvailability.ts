import type { MatchWindow } from '@hueckoapp/shared';
import { useCallback } from 'react';

import { getAvailability } from '../api/groups';
import { useResource } from './useResource';

const NO_WINDOWS: MatchWindow[] = [];

// Huecos en común del grupo (calculados en el servidor).
export function useAvailability(groupId: string) {
  const load = useCallback(() => getAvailability(groupId), [groupId]);
  const { data, loading, refreshing, error, reload } = useResource(load);
  return { windows: data ?? NO_WINDOWS, loading, refreshing, error, reload };
}
