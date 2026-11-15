import type { Db } from '../db/db';
import type { PlanInfo } from './messages';

// A quién y sobre qué se avisa. Se llama dentro de la transacción del cambio, después del UPDATE: el plan se lee ya
// cambiado y los destinatarios son los miembros de ese momento.

/** El plan con el nombre de su grupo (una consulta). Lanza si no existe: quien llama acaba de cambiarlo. */
export async function planInfo(db: Db, proposalId: string): Promise<PlanInfo> {
  const row = await db.one<{
    group_id: string;
    group_name: string;
    title: string;
    scheduled_at: string | null;
    location_name: string | null;
  }>(
    `SELECT p.group_id, g.name AS group_name, p.title, p.scheduled_at, p.location_name
     FROM proposals p JOIN groups g ON g.id = p.group_id
     WHERE p.id = $1`,
    [proposalId],
  );
  if (!row) throw new Error(`No existe la propuesta ${proposalId} para avisar.`);
  return {
    proposalId,
    groupId: row.group_id,
    groupName: row.group_name,
    title: row.title,
    scheduledAt: row.scheduled_at,
    locationName: row.location_name,
  };
}

/** Los miembros actuales del grupo, menos `except` (quien hizo el cambio a mano; null = nadie). */
export async function groupMemberIds(db: Db, groupId: string, { except = null }: { except?: string | null } = {}): Promise<string[]> {
  const rows = await db.many<{ user_id: string }>('SELECT user_id FROM group_members WHERE group_id = $1 ORDER BY user_id', [groupId]);
  return rows.map((r) => r.user_id).filter((id) => id !== except);
}

/** El nombre de una persona, para {nombre}. */
export async function userName(db: Db, userId: string): Promise<string> {
  const row = await db.one<{ name: string }>('SELECT name FROM users WHERE id = $1', [userId]);
  if (!row) throw new Error(`No existe la persona ${userId} para avisar.`);
  return row.name;
}
