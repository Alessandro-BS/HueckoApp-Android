import type { Proposal } from '@hueckoapp/shared';
import { useCallback } from 'react';

import { listGroupProposals } from '../api/proposals';
import { queryKeys } from '../api/queryClient';
import { useApiQuery } from './useApiQuery';

const NO_PROPOSALS: Proposal[] = [];

// Propuestas de un grupo, las más recientes primero (el orden lo da el servidor, C10).
export function useProposals(groupId: string) {
  const load = useCallback(() => listGroupProposals(groupId), [groupId]);
  const { data, loaded, loading, refreshing, error, failedLoads, reload } = useApiQuery(queryKeys.proposals(groupId), load);
  return { proposals: data ?? NO_PROPOSALS, loaded, loading, refreshing, error, failedLoads, reload };
}
