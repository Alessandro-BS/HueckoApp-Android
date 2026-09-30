import type { VotingSummary } from '@hueckoapp/shared';
import { useCallback, useLayoutEffect, useState } from 'react';

import { summarizeVoting } from '../api/ai';
import { useAction } from './useAction';

// «Resumen con Huecko IA» del detalle del plan. Solo lee: nunca cambia el plan. El resumen va ligado a
// su plan: al cambiar de proposalId no se muestra el del anterior.
export function useVotingSummary(proposalId: string) {
  const [stored, setStored] = useState<{ proposalId: string; summary: VotingSummary } | null>(null);
  const call = useCallback(() => summarizeVoting(proposalId), [proposalId]);
  const { run, loading, error, clearError } = useAction(call);
  useLayoutEffect(() => clearError(), [proposalId, clearError]);
  const request = useCallback(async () => {
    const result = await run();
    if (result.ok) setStored({ proposalId, summary: result.value });
    return result.ok;
  }, [run, proposalId]);
  const summary = stored?.proposalId === proposalId ? stored.summary : null;
  return { summary, loading, error, request };
}
