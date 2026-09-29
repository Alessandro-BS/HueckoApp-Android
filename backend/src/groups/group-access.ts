import type { Group, GroupMember } from '@hueckoapp/shared';

import { ApiError } from '../middleware/errors';
import type { groupsRepository } from './groups.repository';

type GroupsRepository = ReturnType<typeof groupsRepository>;

// 404 si el grupo no existe; 403 si existe pero no soy miembro (igual en todas las rutas del grupo y sus propuestas).
export function loadGroupForMember(groups: GroupsRepository, groupId: string, userId: string): { group: Group; me: GroupMember } {
  const group = groups.findById(groupId);
  if (!group) throw new ApiError(404, 'GROUP_NOT_FOUND', 'Grupo no encontrado.');
  const me = group.members.find((m) => m.id === userId);
  if (!me) throw new ApiError(403, 'NOT_A_MEMBER', 'No perteneces a este grupo.');
  return { group, me };
}
