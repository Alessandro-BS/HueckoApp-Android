import type { VotingSummary } from '@hueckoapp/shared';
import { useCallback, useState } from 'react';

import { summarizeVoting } from '../api/ai';
import { useAction } from './useAction';

// «Resumen con Huecko IA» del detalle del plan. Solo lee: nunca cambia el plan.
export function useVotingSummary(proposalId: string) {
  const [summary, setSummary] = useState<VotingSummary | null>(null);
  const call = useCallback(() => summarizeVoting(proposalId), [proposalId]);
  const { run, loading, error } = useAction(call);
  const request = useCallback(async () => {
    const result = await run();
    if (result.ok) setSummary(result.value);
    return result.ok;
  }, [run]);
  return { summary, loading, error, request };
}
