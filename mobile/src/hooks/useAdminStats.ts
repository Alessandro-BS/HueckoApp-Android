import type { AdminStats, PopularHours, Timeseries } from '@hueckoapp/shared';

import { getAdminStats, getPopularHours, getTimeseries } from '../api/admin';
import { lastWeeksRange } from '../utils/admin';
import { today } from '../utils/clock';
import { useResource } from './useResource';

export const STATS_WEEKS = 12;

export type AdminStatsData = { stats: AdminStats; weekly: Timeseries; hours: PopularHours };

// Totales, las últimas 12 semanas y las horas populares en una sola carga (se recargan juntos).
const loadStats = async (): Promise<AdminStatsData> => {
  const [stats, weekly, hours] = await Promise.all([
    getAdminStats(),
    getTimeseries(lastWeeksRange(today(), STATS_WEEKS), 'week'),
    getPopularHours(),
  ]);
  return { stats, weekly, hours };
};

export function useAdminStats() {
  const { data, loaded, loading, refreshing, error, failedLoads, reload } = useResource(loadStats);
  return { stats: data?.stats, weekly: data?.weekly, hours: data?.hours, loaded, loading, refreshing, error, failedLoads, reload };
}
