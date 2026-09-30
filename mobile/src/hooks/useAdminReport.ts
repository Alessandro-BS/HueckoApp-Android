import { useCallback } from 'react';

import { getReport, type DateRange } from '../api/admin';
import { useResource } from './useResource';

// Informe del periodo aplicado. Depende de los dos días (no de la identidad del objeto): no recarga por un render.
export function useAdminReport(range: DateRange) {
  const { from, to } = range;
  const load = useCallback(() => getReport({ from, to }), [from, to]);
  const { data, loaded, loading, refreshing, error, failedLoads, reload } = useResource(load);
  return { report: data, loaded, loading, refreshing, error, failedLoads, reload };
}
