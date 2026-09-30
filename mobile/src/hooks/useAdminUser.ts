import type { UserRole, UserStatus } from '@hueckoapp/shared';
import { useCallback } from 'react';

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

  const { clearError: clearStatusError } = status;
  const { clearError: clearRoleError } = role;
  const clearActionError = useCallback(() => {
    clearStatusError();
    clearRoleError();
  }, [clearStatusError, clearRoleError]);

  return {
    user: data, loading, refreshing, error, reload,
    setStatus: status.run,
    setRole: role.run,
    saving: status.loading || role.loading,
    actionError: status.error ?? role.error,
    clearActionError,
  };
}
