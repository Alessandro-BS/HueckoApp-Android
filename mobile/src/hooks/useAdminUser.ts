import type { UserRole, UserStatus } from '@hueckoapp/shared';
import { useCallback, useState } from 'react';

import { getAdminUser, setUserRole, setUserStatus } from '../api/admin';
import { useAction } from './useAction';
import { useResource } from './useResource';

// Detalle de una cuenta y sus dos acciones. No lanzan: devuelven { ok } y dejan el mensaje en actionError.
export function useAdminUser(userId: string) {
  const load = useCallback(() => getAdminUser(userId), [userId]);
  const { data, loading, refreshing, error, reload, mutate } = useResource(load);

  const status = useAction(async (next: UserStatus) => {
    const updated = await setUserStatus(userId, next);
    mutate(() => updated);
    return updated;
  });
  const role = useAction(async (next: UserRole) => {
    const updated = await setUserRole(userId, next);
    mutate(() => updated);
    return updated;
  });

  // El mensaje mostrado es siempre el de la acción más reciente: cada una limpia su propio error al empezar,
  // así que basta con saber cuál se lanzó última (una que sale bien deja el mensaje vacío).
  const [last, setLast] = useState<'status' | 'role'>('status');
  const runStatus = useCallback((next: UserStatus) => {
    setLast('status');
    return status.run(next);
  }, [status.run]);
  const runRole = useCallback((next: UserRole) => {
    setLast('role');
    return role.run(next);
  }, [role.run]);

  const { clearError: clearStatusError } = status;
  const { clearError: clearRoleError } = role;
  const clearActionError = useCallback(() => {
    clearStatusError();
    clearRoleError();
  }, [clearStatusError, clearRoleError]);

  return {
    user: data, loading, refreshing, error, reload,
    setStatus: runStatus,
    setRole: runRole,
    saving: status.loading || role.loading,
    actionError: last === 'status' ? status.error : role.error,
    clearActionError,
  };
}
