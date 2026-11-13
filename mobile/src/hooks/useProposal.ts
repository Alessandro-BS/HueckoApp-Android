import type { ExpressOption, IncidenceInput, Proposal, ReplanInput, TimeWindowInput } from '@hueckoapp/shared';
import { useCallback } from 'react';

import {
  addWindow as postWindow,
  cancelProposal,
  confirmProposal,
  getProposal,
  removeVote,
  replanProposal,
  reportIncidence as postIncidence,
  voteExpress as putExpressVote,
  voteWindow,
} from '../api/proposals';
import { useResource } from './useResource';
import { useVoteToggle } from './useVoteToggle';

export type { VoteOutcome } from './useVoteToggle';

const NO_VOTES: readonly string[] = [];

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

  const { toggle, loading: voting, error: voteError, clearError: clearVoteError } = useVoteToggle({
    votesOf: () => data?.myVoteWindowIds ?? NO_VOTES,
    isMultiple: () => data?.multipleVotes ?? false,
    vote: async (id, windowId) => apply(await voteWindow(id, windowId)),
    // Sin windowId se llama con un solo argumento: DELETE sin ?windowId= quita todos mis votos (voto único).
    unvote: async (id, windowId) => apply(windowId ? await removeVote(id, windowId) : await removeVote(id)),
  });
  const toggleVote = useCallback((windowId: string) => toggle(proposalId, windowId), [toggle, proposalId]);

  const addWindow = useCallback(async (input: TimeWindowInput) => apply(await postWindow(proposalId, input)), [proposalId, apply]);
  const confirm = useCallback(async (windowId?: string) => apply(await confirmProposal(proposalId, windowId)), [proposalId, apply]);
  const cancel = useCallback(async () => apply(await cancelProposal(proposalId)), [proposalId, apply]);
  const reportIncidence = useCallback(
    async (input: IncidenceInput) => apply(await postIncidence(proposalId, input)),
    [proposalId, apply],
  );
  // Votación exprés: como las demás acciones, lanza si falla (409 VOTING_CLOSED, 403 si no puedo votar).
  const voteExpress = useCallback(
    async (option: ExpressOption) => apply(await putExpressVote(proposalId, option)),
    [proposalId, apply],
  );

  const replan = useCallback(async (input: ReplanInput) => apply(await replanProposal(proposalId, input)), [proposalId, apply]);

  return {
    proposal: data, loading, refreshing, error, failedLoads, reload,
    toggleVote, voting, voteError, clearVoteError,
    addWindow, confirm, cancel, reportIncidence, voteExpress, replan,
  };
}
