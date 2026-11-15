import type { Db } from '../db/db';
import type { PlanInfo } from './messages';
import { reminderMessage } from './messages';
import { enqueue, type OutboxItem } from './outbox.repository';

/** Con cuánta antelación se avisa: los planes que empiezan dentro de esta ventana. */
export const REMINDER_WINDOW_MS = 60 * 60_000;

type Row = {
  proposal_id: string;
  group_id: string;
  group_name: string;
  title: string;
  scheduled_at: string;
  location_name: string | null;
  user_id: string;
};

/**
 * Encola un REMINDER por miembro actual de cada plan CONFIRMADO que empieza dentro de la próxima hora (y aún no
 * empezó), salvo quien reportó FALTA o IMPREVISTO en ese plan (TARDANZA sí recibe). La clave
 * `reminder:{plan}:{persona}:{scheduledAt}` hace que dos barridos no repitan el aviso y que un plan replanteado para
 * otra hora vuelva a avisar. Devuelve cuántos avisos nuevos encoló.
 */
export async function enqueueDueReminders(db: Db, now: Date): Promise<number> {
  const rows = await db.many<Row>(
    `SELECT p.id AS proposal_id, p.group_id, g.name AS group_name, p.title, p.scheduled_at, p.location_name, m.user_id
     FROM proposals p
     JOIN groups g ON g.id = p.group_id
     JOIN group_members m ON m.group_id = p.group_id
     WHERE p.state = 'CONFIRMADO' AND p.scheduled_at > $1 AND p.scheduled_at <= $2
       AND NOT EXISTS (
         SELECT 1 FROM incidences i
         WHERE i.proposal_id = p.id AND i.user_id = m.user_id AND i.type IN ('FALTA', 'IMPREVISTO')
       )
     ORDER BY p.id, m.user_id`,
    [now.toISOString(), new Date(now.getTime() + REMINDER_WINDOW_MS).toISOString()],
  );
  const items: OutboxItem[] = rows.map((row) => {
    const plan: PlanInfo = {
      proposalId: row.proposal_id,
      groupId: row.group_id,
      groupName: row.group_name,
      title: row.title,
      scheduledAt: row.scheduled_at,
      locationName: row.location_name,
    };
    return {
      userId: row.user_id,
      kind: 'REMINDER',
      ...reminderMessage(plan),
      dedupeKey: `reminder:${row.proposal_id}:${row.user_id}:${row.scheduled_at}`,
    };
  });
  return enqueue(db, items, now);
}
