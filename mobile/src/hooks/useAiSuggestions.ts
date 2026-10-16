import type { PlanSuggestion } from '@hueckoapp/shared';
import { useCallback, useLayoutEffect, useState } from 'react';

import { suggestPlans } from '../api/ai';
import { useAction } from './useAction';

// «Ideas con IA» del grupo. Se piden a demanda (cada llamada gasta cupo de IA); si un reintento falla,
// se conservan las ideas anteriores. Las ideas van ligadas a su grupo: al cambiar de groupId no se
// muestran las del anterior.
export function useAiSuggestions(groupId: string) {
  const [stored, setStored] = useState<{ groupId: string; suggestions: PlanSuggestion[] } | null>(null);
  const request = useCallback(() => suggestPlans(groupId), [groupId]);
  const { run, loading, error, clearError } = useAction(request);
  useLayoutEffect(() => clearError(), [groupId, clearError]);
  const fetch = useCallback(async () => {
    const result = await run();
    if (result.ok) setStored({ groupId, suggestions: result.value.suggestions });
    return result.ok;
  }, [run, groupId]);
  const suggestions = stored?.groupId === groupId ? stored.suggestions : null;
  return { suggestions, loading, error, fetch };
}
