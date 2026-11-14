import type { ProposalDraft } from '@hueckoapp/shared';
import { useCallback } from 'react';

import { draftProposal } from '../api/ai';
import { useAction } from './useAction';

// «Rellenar con IA» en Nueva propuesta. Nunca lanza: null si falló (el motivo queda en `error`).
export function useProposalDraft(groupId: string) {
  const request = useCallback((text: string, week?: string) => draftProposal(groupId, text, week), [groupId]);
  const { run, loading, error, clearError } = useAction(request);
  const generate = useCallback(
    async (text: string, week?: string): Promise<ProposalDraft | null> => {
      const result = await run(text, week);
      return result.ok ? result.value : null;
    },
    [run],
  );
  return { generate, generating: loading, error, clearError };
}
