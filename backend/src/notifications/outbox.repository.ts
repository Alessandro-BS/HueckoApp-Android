import { randomUUID } from 'node:crypto';

import type { NotificationData, NotificationKind } from '@hueckoapp/shared';

import type { Db, SqlParam } from '../db/db';
import type { NotificationMessage } from './messages';

// Bandeja de salida: cada cambio de un plan escribe aquí sus avisos, en su misma transacción (si el cambio se deshace,
// el aviso también; si se guarda, el aviso queda pendiente hasta que el envío lo marque). Aquí no se envía nada.

export type OutboxItem = {
  userId: string;
  kind: NotificationKind;
  title: string;
  body: string;
  data: NotificationData;
  /** Con clave, un aviso repetido (p. ej. dos barridos del mismo recordatorio) no se inserta dos veces. */
  dedupeKey?: string;
};

const COLUMNS = 7;

/** Inserta los avisos en un solo INSERT; los que choquen con un `dedupe_key` existente se saltan. Devuelve los insertados. */
export async function enqueue(db: Db, items: readonly OutboxItem[], now: Date): Promise<number> {
  if (items.length === 0) return 0;
  const createdAt = now.toISOString();
  const params: SqlParam[] = [];
  const rows = items.map((item, i) => {
    params.push(randomUUID(), item.userId, item.kind, item.title, item.body, JSON.stringify(item.data), item.dedupeKey ?? null);
    const at = i * COLUMNS;
    return `($${at + 1}, $${at + 2}, $${at + 3}, $${at + 4}, $${at + 5}, $${at + 6}, $${at + 7}, $${items.length * COLUMNS + 1})`;
  });
  params.push(createdAt);
  const { rowCount } = await db.query(
    `INSERT INTO notifications (id, user_id, kind, title, body, data, dedupe_key, created_at) VALUES ${rows.join(', ')}
     ON CONFLICT (dedupe_key) DO NOTHING`,
    params,
  );
  return rowCount;
}

/** El mismo aviso para cada destinatario. */
export const enqueueMessage = (db: Db, userIds: readonly string[], message: NotificationMessage, now: Date): Promise<number> =>
  enqueue(db, userIds.map((userId) => ({ userId, kind: message.data.kind, ...message })), now);
