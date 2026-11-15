import type { GroupMember } from '@hueckoapp/shared';

// Lo mínimo de un miembro para decidir quién gestiona.
export type ManagerCandidate = Pick<GroupMember, 'id' | 'role'>;

export type ManageCheck = { viewerId: string; creatorId: string; members: readonly ManagerCandidate[] };

/**
 * Quién gestiona (confirma, cancela, replantea) una propuesta: quien la creó mientras siga en el grupo, o cualquier
 * organizador del grupo. Siempre hay al menos un organizador (409 LAST_ORGANIZER y la herencia al salir), así que
 * ninguna propuesta queda huérfana.
 * Punto único de la regla: lo usan el repositorio (campo canManage) y, a través de él, las rutas e Inicio.
 * El futuro rol de administrador de la app se añade aquí (p. ej. `viewerIsAdmin` en ManageCheck).
 */
export function canManageProposal({ viewerId, creatorId, members }: ManageCheck): boolean {
  const viewer = members.find((m) => m.id === viewerId);
  if (!viewer) return false;
  return viewer.id === creatorId || viewer.role === 'ORGANIZER';
}
