import type { NotificationData } from '@hueckoapp/shared';

import type { Db } from '../db/db';
import { devicesRepository } from './devices.repository';
import { PUSH_BATCH_SIZE, type PushClient, type PushMessage, type PushTicket } from './push-client';

// El envío de la bandeja de salida: reclama hasta 100 avisos pendientes en una transacción corta y la cierra (nunca se
// mantiene un bloqueo durante la llamada a Expo), manda un mensaje por cada celular del destinatario y anota el
// resultado de cada aviso. Dos envíos a la vez (o un envío y el barrido) no se pisan: SKIP LOCKED + claimed_at.

/** Avisos que reclama cada pasada. */
export const FLUSH_BATCH_SIZE = 100;
/** Un reclamo sin resolver más viejo que esto (el proceso murió a mitad) vuelve a estar pendiente. */
export const CLAIM_EXPIRES_MS = 5 * 60_000;
/** Con tantos fallos de transporte el aviso se abandona: queda con sent_at y su last_error. */
export const MAX_ATTEMPTS = 5;

type Claimed = { id: string; user_id: string; title: string; body: string; data: string; attempts: number };
type Outcome = { ok: boolean; transportError: string | null; ticketError: string | null };
type Result = 'sent' | 'retry' | 'abandoned';

/**
 * Una pasada. `sent`: avisos que quedan resueltos (algún celular lo recibió, la persona no tiene celulares o todos sus
 * tokens están muertos); `failed`: avisos con error de transporte (se reintentan, o se abandonan al quinto). Nunca lanza.
 */
export async function flushNotifications(db: Db, push: PushClient, now: Date): Promise<{ sent: number; failed: number }> {
  try {
    return await flush(db, push, now);
  } catch (error) {
    logFlushError(error);
    return { sent: 0, failed: 0 };
  }
}

async function flush(db: Db, push: PushClient, now: Date): Promise<{ sent: number; failed: number }> {
  const at = now.toISOString();
  const claimed = await claim(db, now);
  if (claimed.length === 0) return { sent: 0, failed: 0 };

  // Ya fuera de la transacción: los celulares de cada destinatario y un mensaje por celular.
  const devices = devicesRepository(db);
  const tokens = await devices.tokensOf([...new Set(claimed.map((n) => n.user_id))]);
  const outgoing: { notification: number; message: PushMessage }[] = [];
  claimed.forEach((n, i) => {
    const data = JSON.parse(n.data) as NotificationData;
    for (const to of tokens.get(n.user_id) ?? []) {
      outgoing.push({ notification: i, message: { to, title: n.title, body: n.body, data, channelId: 'planes', priority: 'high', sound: 'default' } });
    }
  });

  const outcomes: Outcome[] = claimed.map(() => ({ ok: false, transportError: null, ticketError: null }));
  const deadTokens = new Set<string>();
  for (let i = 0; i < outgoing.length; i += PUSH_BATCH_SIZE) {
    const batch = outgoing.slice(i, i + PUSH_BATCH_SIZE);
    let tickets: PushTicket[];
    try {
      tickets = await push.send(batch.map((o) => o.message));
      if (tickets.length !== batch.length) throw new Error(`Expo devolvió ${tickets.length} tickets para ${batch.length} mensajes`);
    } catch (error) {
      // No se sabe qué llegó: todo el lote se reintenta (salvo los avisos que otro lote ya entregó).
      const message = error instanceof Error ? error.message : String(error);
      for (const { notification } of batch) outcomes[notification]!.transportError ??= message;
      continue;
    }
    tickets.forEach((ticket, k) => {
      const { notification, message } = batch[k]!;
      const outcome = outcomes[notification]!;
      if (ticket.status === 'ok') {
        outcome.ok = true;
        return;
      }
      outcome.ticketError ??= ticket.details?.error ? `${ticket.details.error}: ${ticket.message}` : ticket.message;
      if (ticket.details?.error === 'DeviceNotRegistered') deadTokens.add(message.to);
    });
  }
  for (const token of deadTokens) await devices.removeToken(token);

  // Por aviso: algún ok → enviado; error de transporte → se reintenta (o se abandona); si no (sin celulares, o solo
  // tickets de error como DeviceNotRegistered) no hay nada que reintentar: queda enviado con el error, si lo hubo.
  // Una UPDATE por resultado y error (casi siempre una o dos), no una por aviso.
  const updates = new Map<string, { result: Result; error: string | null; ids: string[] }>();
  const add = (result: Result, error: string | null, id: string) => {
    const key = `${result}\u0000${error ?? ''}`;
    const group = updates.get(key) ?? { result, error, ids: [] };
    group.ids.push(id);
    updates.set(key, group);
  };
  let sent = 0;
  let failed = 0;
  claimed.forEach((n, i) => {
    const { ok, transportError, ticketError } = outcomes[i]!;
    if (ok || transportError === null) {
      sent++;
      add('sent', ok ? null : ticketError, n.id);
    } else {
      failed++;
      add(n.attempts + 1 >= MAX_ATTEMPTS ? 'abandoned' : 'retry', transportError, n.id);
    }
  });
  for (const { result, error, ids } of updates.values()) await record(db, result, error, ids, at);
  return { sent, failed };
}

/** Reclama en una transacción corta: al volver, las filas ya llevan claimed_at y nadie más las toma en 5 min. */
function claim(db: Db, now: Date): Promise<Claimed[]> {
  return db.transaction(async () => {
    const rows = await db.many<Claimed>(
      `SELECT id, user_id, title, body, data, attempts FROM notifications
       WHERE sent_at IS NULL AND (claimed_at IS NULL OR claimed_at < $1)
       ORDER BY seq LIMIT ${FLUSH_BATCH_SIZE} FOR UPDATE SKIP LOCKED`,
      [new Date(now.getTime() - CLAIM_EXPIRES_MS).toISOString()],
    );
    if (rows.length > 0) {
      await db.query('UPDATE notifications SET claimed_at = $1 WHERE id = ANY($2::text[])', [now.toISOString(), rows.map((r) => r.id)]);
    }
    return rows;
  });
}

/**
 * Anota el resultado. `sent`: resuelto (con el error del ticket si no llegó a ningún celular); `retry`: un intento más
 * y otra vez pendiente; `abandoned`: un intento más y resuelto con su error. `sent_at IS NULL`: nunca se reescribe un
 * aviso ya resuelto.
 */
function record(db: Db, result: Result, error: string | null, ids: string[], at: string): Promise<unknown> {
  switch (result) {
    case 'sent':
      return db.query(
        'UPDATE notifications SET sent_at = $1, last_error = COALESCE($2, last_error) WHERE id = ANY($3::text[]) AND sent_at IS NULL',
        [at, error, ids],
      );
    case 'retry':
      return db.query(
        'UPDATE notifications SET attempts = attempts + 1, last_error = $1, claimed_at = NULL WHERE id = ANY($2::text[]) AND sent_at IS NULL',
        [error, ids],
      );
    case 'abandoned':
      return db.query(
        'UPDATE notifications SET attempts = attempts + 1, last_error = $1, sent_at = $2 WHERE id = ANY($3::text[]) AND sent_at IS NULL',
        [error, at, ids],
      );
  }
}

/** Un envío que falla no corta nada: se anota (salvo en los tests) y lo retoma el siguiente. */
export function logFlushError(error: unknown): void {
  if (process.env.NODE_ENV === 'test') return;
  console.error('No se pudieron enviar los avisos:', error instanceof Error ? error.message : error);
}
