import type { GroupMember, GroupSummary } from '@hueckoapp/shared';
import { useQueryClient } from '@tanstack/react-query';
import { useCallback } from 'react';

import { getGroup, leaveGroup, updateMember } from '../api/groups';
import { queryKeys } from '../api/queryClient';
import { useApiQuery } from './useApiQuery';

// Detalle de un grupo con sus miembros.
export function useGroup(groupId: string) {
  const load = useCallback(() => getGroup(groupId), [groupId]);
  const queryClient = useQueryClient();
  const { data, loading, refreshing, error, reload, mutate } = useApiQuery(queryKeys.group(groupId), load);

  const replaceMember = useCallback(
    (member: GroupMember) =>
      mutate((prev) => prev && { ...prev, members: prev.members.map((m) => (m.id === member.id ? member : m)) }),
    [mutate],
  );

  // Lanza si falla.
  const setEssential = useCallback(
    async (userId: string, isEssential: boolean) => replaceMember(await updateMember(groupId, userId, { isEssential })),
    [groupId, replaceMember],
  );

  // Nombra o quita a un organizador. Lanza si falla (p. ej. 409 LAST_ORGANIZER).
  const setMemberRole = useCallback(
    async (userId: string, role: 'ORGANIZER' | 'MEMBER') => replaceMember(await updateMember(groupId, userId, { role })),
    [groupId, replaceMember],
  );

  // Lanza si falla. Si sale bien, el grupo desaparece ya de «Mis grupos» (sin esperar a recargar la lista).
  const leave = useCallback(async () => {
    await leaveGroup(groupId);
    queryClient.setQueryData<GroupSummary[]>(queryKeys.groups, (prev) => prev?.filter((g) => g.id !== groupId));
  }, [groupId, queryClient]);

  return { group: data, loading, refreshing, error, reload, setEssential, setMemberRole, leave };
}
