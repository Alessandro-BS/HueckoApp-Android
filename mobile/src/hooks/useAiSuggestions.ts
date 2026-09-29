import type { PlanSuggestion } from '@hueckoapp/shared';
import { useCallback, useState } from 'react';

import { suggestPlans } from '../api/ai';
import { useAction } from './useAction';

// «Ideas con IA» del grupo. Se piden a demanda (cada llamada gasta cupo de IA); si un reintento falla,
// se conservan las ideas anteriores.
export function useAiSuggestions(groupId: string) {
  const [suggestions, setSuggestions] = useState<PlanSuggestion[] | null>(null);
  const request = useCallback(() => suggestPlans(groupId), [groupId]);
  const { run, loading, error } = useAction(request);
  const fetch = useCallback(async () => {
    const result = await run();
    if (result.ok) setSuggestions(result.value.suggestions);
    return result.ok;
  }, [run]);
  return { suggestions, loading, error, fetch };
}
