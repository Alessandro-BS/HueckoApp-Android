import type { IncidenceInput, Proposal, ResolveIncidencesInput, TimeWindowInput } from '@hueckoapp/shared';
import { useCallback } from 'react';

import {
  addWindow as postWindow,
  cancelProposal,
  confirmProposal,
  getProposal,
  removeVote,
  reportIncidence as postIncidence,
  resolveIncidences,
  voteWindow,
} from '../api/proposals';
import { useResource } from './useResource';
import { useVoteToggle } from './useVoteToggle';

export type { VoteOutcome } from './useVoteToggle';

// Una propuesta y todo lo que se puede hacer con ella. Cada acción reemplaza la propuesta con la que
// devuelve el servidor (una sola fuente de verdad: B7). Votar usa useVoteToggle (no lanza: devuelve
// { ok } y expone `voteError`); las demás acciones LANZAN si fallan y la pantalla decide cómo avisar.
export function useProposal(proposalId: string) {
  const load = useCallback(() => getProposal(proposalId), [proposalId]);
  const { data, loading, refreshing, error, failedLoads, reload, mutate } = useResource(load);

  const apply = useCallback(
    (proposal: Proposal) => {
      mutate(() => proposal);
      return proposal;
    },
    [mutate],
  );

  const myVote = data?.myVoteWindowId ?? null;
  const { toggle, loading: voting, error: voteError, clearError: clearVoteError } = useVoteToggle({
    currentVote: () => myVote,
    vote: async (id, windowId) => apply(await voteWindow(id, windowId)),
    unvote: async (id) => apply(await removeVote(id)),
  });
  const toggleVote = useCallback((windowId: string) => toggle(proposalId, windowId), [toggle, proposalId]);

  const addWindow = useCallback(async (input: TimeWindowInput) => apply(await postWindow(proposalId, input)), [proposalId, apply]);
  const confirm = useCallback(async (windowId?: string) => apply(await confirmProposal(proposalId, windowId)), [proposalId, apply]);
  const cancel = useCallback(async () => apply(await cancelProposal(proposalId)), [proposalId, apply]);
  const reportIncidence = useCallback(
    async (input: IncidenceInput) => apply(await postIncidence(proposalId, input)),
    [proposalId, apply],
  );
  const resolve = useCallback(
    async (input: ResolveIncidencesInput) => apply(await resolveIncidences(proposalId, input)),
    [proposalId, apply],
  );

  return {
    proposal: data, loading, refreshing, error, failedLoads, reload,
    toggleVote, voting, voteError, clearVoteError,
    addWindow, confirm, cancel, reportIncidence, resolve,
  };
}
