import type { GroupSummary } from '@hueckoapp/shared';
import { useQueryClient } from '@tanstack/react-query';
import { useCallback } from 'react';

import { getGroup, leaveGroup, setMemberEssential } from '../api/groups';
import { queryKeys } from '../api/queryClient';
import { useApiQuery } from './useApiQuery';

// Detalle de un grupo con sus miembros.
export function useGroup(groupId: string) {
  const load = useCallback(() => getGroup(groupId), [groupId]);
  const queryClient = useQueryClient();
  const { data, loading, refreshing, error, reload, mutate } = useApiQuery(queryKeys.group(groupId), load);

  // Lanza si falla.
  const setEssential = useCallback(
    async (userId: string, isEssential: boolean) => {
      const member = await setMemberEssential(groupId, userId, isEssential);
      mutate((prev) => prev && { ...prev, members: prev.members.map((m) => (m.id === member.id ? member : m)) });
    },
    [groupId, mutate],
  );

  // Lanza si falla. Si sale bien, el grupo desaparece ya de «Mis grupos» (sin esperar a recargar la lista).
  const leave = useCallback(async () => {
    await leaveGroup(groupId);
    queryClient.setQueryData<GroupSummary[]>(queryKeys.groups, (prev) => prev?.filter((g) => g.id !== groupId));
  }, [groupId, queryClient]);

  return { group: data, loading, refreshing, error, reload, setEssential, leave };
}
