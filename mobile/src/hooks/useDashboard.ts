import type { Dashboard, Proposal, TimeBlock } from '@hueckoapp/shared';
import { useEffect, useState } from 'react';

import { getDashboard } from '../api/dashboard';
import { removeVote, voteWindow } from '../api/proposals';
import { listTimeBlocks } from '../api/schedule';
import { dashboardCache } from '../storage/appStorage';
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

// `userId` activa la copia local (AsyncStorage): al abrir Inicio se muestra la última copia mientras llega la del
// servidor, o en su lugar si no hay red (`stale`). Cada carga buena reemplaza la copia.
export function useDashboard(userId?: string) {
  const { data: fresh, loading, refreshing, error, failedLoads, reload, mutate } = useResource(loadDashboard);
  const [cached, setCached] = useState<{ userId: string; data: DashboardData }>();

  useEffect(() => {
    if (!userId) return;
    let cancelled = false;
    void dashboardCache.get(userId).then((saved) => {
      if (!cancelled && saved) setCached({ userId, data: saved });
    });
    return () => {
      cancelled = true;
    };
  }, [userId]);

  useEffect(() => {
    if (userId && fresh) void dashboardCache.set(userId, fresh);
  }, [userId, fresh]);

  const fromCache = fresh === undefined && cached?.userId === userId ? cached?.data : undefined;
  const data = fresh ?? fromCache;
  const stale = fromCache !== undefined;

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

  // Con la copia en pantalla no se vota: sus votaciones pueden estar desactualizadas (y votar sobre ellas pisaría la carga en curso).
  return {
    dashboard: data?.dashboard, blocks: data?.blocks ?? NO_BLOCKS, loaded: data !== undefined, stale,
    loading, refreshing: refreshing || (stale && loading), error, failedLoads, reload,
    toggleVote, voting: voting || stale, voteError, clearVoteError,
  };
}
