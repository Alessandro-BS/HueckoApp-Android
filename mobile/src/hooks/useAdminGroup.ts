import { useCallback } from 'react';

import { cancelProposalAsAdmin, deleteAdminGroup, getAdminGroup } from '../api/admin';
import { useAction } from './useAction';
import { useResource } from './useResource';

// Detalle de un grupo para la administración: borrarlo y cancelar sus propuestas (moderación). No lanzan.
export function useAdminGroup(groupId: string) {
  const load = useCallback(() => getAdminGroup(groupId), [groupId]);
  const { data, loading, refreshing, error, reload, mutate } = useResource(load);

  const removeAction = useAction(() => deleteAdminGroup(groupId));
  const cancelAction = useAction(async (proposalId: string, reason?: string) => {
    const updated = await cancelProposalAsAdmin(proposalId, reason);
    mutate((prev) => prev && { ...prev, proposals: prev.proposals.map((p) => (p.id === updated.id ? updated : p)) });
    return updated;
  });

  return {
    group: data, loading, refreshing, error, reload,
    remove: removeAction.run,
    removing: removeAction.loading,
    removeError: removeAction.error,
    cancelProposal: cancelAction.run,
    cancelling: cancelAction.loading,
    cancelError: cancelAction.error,
    clearCancelError: cancelAction.clearError,
  };
}
