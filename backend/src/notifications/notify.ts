import type { Db } from '../db/db';
import { groupMemberIds, planInfo } from './audience';
import type { NotificationMessage, PlanInfo } from './messages';
import { enqueueMessage } from './outbox.repository';

/**
 * Avisa a los miembros **actuales** del grupo del plan, menos `except` (quien hizo el cambio a mano; sin él, a todos).
 * Se llama dentro de la transacción del cambio, después del UPDATE y solo si el cambio ocurrió: el plan se lee ya
 * cambiado. Devuelve los avisos guardados. (EXPRESS_OPENED no pasa por aquí: avisa a los votantes fijados al abrir.)
 */
export async function notifyGroup(
  db: Db,
  proposalId: string,
  build: (plan: PlanInfo) => NotificationMessage,
  { except = null }: { except?: string | null },
  now: Date,
): Promise<number> {
  const plan = await planInfo(db, proposalId);
  return enqueueMessage(db, await groupMemberIds(db, plan.groupId, { except }), build(plan), now);
}
