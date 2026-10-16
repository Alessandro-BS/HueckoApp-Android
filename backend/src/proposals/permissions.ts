import type { GroupMember } from '@hueckoapp/shared';

// Lo mínimo de un miembro para decidir quién gestiona. `members` va SIEMPRE en orden de llegada al grupo
// (joined_at y, si empatan, orden de inserción: `seq`), como lo devuelven groupsRepository y proposalsRepository.
export type ManagerCandidate = Pick<GroupMember, 'id' | 'role'>;

export type ManageCheck = { viewerId: string; creatorId: string; members: readonly ManagerCandidate[] };

/**
 * Quién gestiona (confirma, cancela, reprograma, resuelve) una propuesta, para que ninguna quede huérfana (D1–D3):
 * 1. quien la creó, mientras siga en el grupo;
 * 2. si no, el OWNER: es quien creó el grupo y, si también se fue, C6 ya le pasó el rol a quien lleva más tiempo;
 * 3. si no hubiera OWNER (no debería pasar), quien lleva más tiempo en el grupo.
 * null solo si el grupo no tiene miembros (entonces ya se borró).
 */
export function proposalManagerId(creatorId: string, members: readonly ManagerCandidate[]): string | null {
  if (members.some((m) => m.id === creatorId)) return creatorId;
  return (members.find((m) => m.role === 'OWNER') ?? members[0])?.id ?? null;
}

/**
 * Punto único de la regla: lo usan el repositorio (campo canManage) y, a través de él, las rutas e Inicio.
 * El futuro rol de administrador de la app se añade aquí (p. ej. `viewerIsAdmin` en ManageCheck).
 */
export function canManageProposal({ viewerId, creatorId, members }: ManageCheck): boolean {
  return proposalManagerId(creatorId, members) === viewerId;
}
