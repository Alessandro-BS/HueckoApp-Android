import type { Group, GroupSummary } from '@hueckoapp/shared';
import { useCallback } from 'react';

import { createGroup, joinGroup, listGroups } from '../api/groups';
import { useResource } from './useResource';

const NO_GROUPS: GroupSummary[] = [];

const toSummary = (g: Group): GroupSummary => ({
  id: g.id,
  name: g.name,
  description: g.description,
  memberCount: g.memberCount,
  availabilityThreshold: g.availabilityThreshold,
});

// Mis grupos: la lista, crear y unirse. create/join lanzan si fallan (los diálogos usan useAction).
export function useGroups() {
  const { data, loaded, loading, refreshing, error, reload, mutate } = useResource(listGroups);

  const create = useCallback(
    async (name: string) => {
      const group = await createGroup({ name: name.trim() });
      mutate((prev) => [...(prev ?? []), toSummary(group)]);
      return group;
    },
    [mutate],
  );

  const join = useCallback(
    async (inviteCode: string) => {
      const group = await joinGroup(inviteCode);
      mutate((prev) => [...(prev ?? []).filter((g) => g.id !== group.id), toSummary(group)]);
      return group;
    },
    [mutate],
  );

  return { groups: data ?? NO_GROUPS, loaded, loading, refreshing, error, reload, create, join };
}
