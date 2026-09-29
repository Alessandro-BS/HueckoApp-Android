import type { Dashboard, Proposal, TimeBlock } from '@hueckoapp/shared';

import { getDashboard } from '../api/dashboard';
import { removeVote, voteWindow } from '../api/proposals';
import { listTimeBlocks } from '../api/schedule';
import { useResource } from './useResource';
import { useVoteToggle } from './useVoteToggle';

export type DashboardData = { dashboard: Dashboard; blocks: TimeBlock[] };

const NO_BLOCKS: TimeBlock[] = [];

// El resumen del servidor y mis bloques (el «horario de hoy» depende de la zona horaria del teléfono)
// en una sola carga: se recargan juntos y un error de cualquiera de los dos es el error de Inicio.
const loadDashboard = async (): Promise<DashboardData> => {
  const [dashboard, blocks] = await Promise.all([getDashboard(), listTimeBlocks()]);
  return { dashboard, blocks };
};

export function useDashboard() {
  const { data, loaded, loading, refreshing, error, reload, mutate } = useResource(loadDashboard);

  // Actualiza solo esa votación; conserva el nombre del grupo, que la respuesta no trae.
  const replacePending = (updated: Proposal) =>
    mutate(
      (prev) =>
        prev && {
          ...prev,
          dashboard: {
            ...prev.dashboard,
            pendingVotes: prev.dashboard.pendingVotes.map((p) => (p.id === updated.id ? { ...updated, groupName: p.groupName } : p)),
          },
        },
    );

  // Votar desde «Votaciones en curso»: misma alternancia que en Votar (useVoteToggle). No lanza.
  const { toggle: toggleVote, loading: voting, error: voteError, clearError: clearVoteError } = useVoteToggle({
    currentVote: (proposalId) => data?.dashboard.pendingVotes.find((p) => p.id === proposalId)?.myVoteWindowId,
    vote: async (id, windowId) => replacePending(await voteWindow(id, windowId)),
    unvote: async (id) => replacePending(await removeVote(id)),
  });

  return {
    dashboard: data?.dashboard, blocks: data?.blocks ?? NO_BLOCKS, loaded, loading, refreshing, error, reload,
    toggleVote, voting, voteError, clearVoteError,
  };
}
