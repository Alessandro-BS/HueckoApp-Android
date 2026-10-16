import { useCallback } from 'react';

import { getGroup, leaveGroup, setMemberEssential } from '../api/groups';
import { useResource } from './useResource';

// Detalle de un grupo con sus miembros.
export function useGroup(groupId: string) {
  const load = useCallback(() => getGroup(groupId), [groupId]);
  const { data, loading, refreshing, error, reload, mutate } = useResource(load);

  // Lanza si falla.
  const setEssential = useCallback(
    async (userId: string, isEssential: boolean) => {
      const member = await setMemberEssential(groupId, userId, isEssential);
      mutate((prev) => prev && { ...prev, members: prev.members.map((m) => (m.id === member.id ? member : m)) });
    },
    [groupId, mutate],
  );

  const leave = useCallback(() => leaveGroup(groupId), [groupId]);

  return { group: data, loading, refreshing, error, reload, setEssential, leave };
}
