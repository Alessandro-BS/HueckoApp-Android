import type { NotificationData } from '@hueckoapp/shared';

import type { Db } from '../db/db';
import { devicesRepository } from './devices.repository';
import { PUSH_BATCH_SIZE, type PushClient, type PushMessage, type PushTicket } from './push-client';

// El envío de la bandeja de salida: reclama hasta 100 avisos pendientes en una transacción corta y la cierra (nunca se
// mantiene un bloqueo durante la llamada a Expo), manda un mensaje por cada celular del destinatario y anota el
// resultado de cada aviso. Dos envíos a la vez (o un envío y el barrido) no se pisan: SKIP LOCKED + claimed_at.

/** Avisos que reclama cada pasada. */
export const FLUSH_BATCH_SIZE = 100;
/**
 * Un reclamo más viejo que esto vuelve a estar pendiente: el proceso murió a mitad, o el intento falló con un error
 * reintentable (el reclamo se deja puesto y hace de espera antes del siguiente intento).
 */
export const CLAIM_EXPIRES_MS = 5 * 60_000;
/** Con tantos intentos fallidos el aviso se abandona: queda con sent_at y su last_error. */
export const MAX_ATTEMPTS = 5;
/** Tickets de error que se reintentan como un error de transporte: Expo pide esperar y volver a intentar. */
const RETRYABLE_TICKET_ERRORS: ReadonlySet<string> = new Set(['MessageRateExceeded']);

type Claimed = { id: string; user_id: string; title: string; body: string; data: string; attempts: number };
/**
 * `retryError`: error de transporte del lote o ticket reintentable; `ticketError`: el primer ticket de error;
 * `brokenError`: el aviso no se pudo armar (p. ej. `data` ilegible).
 */
type Outcome = { ok: boolean; retryError: string | null; ticketError: string | null; brokenError: string | null };
type Result = 'sent' | 'retry' | 'abandoned';

/**
 * Una pasada. `sent`: avisos que quedan resueltos (algún celular lo recibió, la persona no tiene celulares o todos sus
 * tickets son errores definitivos, como tokens muertos); `failed`: avisos con un error reintentable (transporte o
 * MessageRateExceeded), que se reintentan pasado el reclamo o se abandonan al quinto intento, y los que no se pueden
 * armar (se abandonan enseguida). Nunca lanza.
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
  const outcomes: Outcome[] = claimed.map(() => ({ ok: false, retryError: null, ticketError: null, brokenError: null }));
  const outgoing: { notification: number; message: PushMessage }[] = [];
  claimed.forEach((n, i) => {
    // Un aviso que no se puede armar fallaría igual siempre: se abandona solo, sin frenar a los demás.
    let data: NotificationData;
    try {
      data = parseData(n.data);
    } catch (error) {
      outcomes[i]!.brokenError = `data ilegible: ${error instanceof Error ? error.message : String(error)}`;
      return;
    }
    for (const to of tokens.get(n.user_id) ?? []) {
      outgoing.push({ notification: i, message: { to, title: n.title, body: n.body, data, channelId: 'planes', priority: 'high', sound: 'default' } });
    }
  });

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
      for (const { notification } of batch) outcomes[notification]!.retryError ??= message;
      continue;
    }
    tickets.forEach((ticket, k) => {
      const { notification, message } = batch[k]!;
      const outcome = outcomes[notification]!;
      if (ticket.status === 'ok') {
        outcome.ok = true;
        return;
      }
      const code = ticket.details?.error;
      const error = code ? `${code}: ${ticket.message}` : ticket.message;
      outcome.ticketError ??= error;
      if (code !== undefined && RETRYABLE_TICKET_ERRORS.has(code)) outcome.retryError ??= error;
      if (code === 'DeviceNotRegistered') deadTokens.add(message.to);
    });
  }
  // Por aviso: ilegible → abandonado; algún ok → enviado; error reintentable (transporte o MessageRateExceeded) → un
  // intento más, con el reclamo puesto como espera (o se abandona al quinto); si no (sin celulares, o solo tickets de
  // error definitivos como DeviceNotRegistered) no hay nada que reintentar: queda enviado con el error, si lo hubo.
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
    const { ok, retryError, ticketError, brokenError } = outcomes[i]!;
    if (brokenError !== null) {
      failed++;
      add('abandoned', brokenError, n.id);
    } else if (ok || retryError === null) {
      sent++;
      add('sent', ok ? null : ticketError, n.id);
    } else {
      failed++;
      add(n.attempts + 1 >= MAX_ATTEMPTS ? 'abandoned' : 'retry', retryError, n.id);
    }
  });
  // Todos los resultados de la pasada o ninguno: si algo falla, los avisos siguen reclamados y se reintentan al vencer
  // el reclamo, sin quedar unos anotados y otros no. Los tokens muertos se borran después: si anotar falla, siguen ahí
  // y el reintento vuelve a enterarse de que están muertos.
  await db.transaction(async () => {
    for (const { result, error, ids } of updates.values()) await record(db, result, error, ids, at);
  });
  for (const token of deadTokens) await devices.removeToken(token);
  return { sent, failed };
}

/** El `data` guardado (JSON de NotificationData). Lanza si no es un objeto con `kind`. */
function parseData(text: string): NotificationData {
  const data: unknown = JSON.parse(text);
  if (typeof data !== 'object' || data === null || typeof (data as { kind?: unknown }).kind !== 'string') {
    throw new Error('no es un objeto con kind');
  }
  return data as NotificationData;
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
 * y sigue pendiente, reclamado ahora (no se reintenta hasta que el reclamo venza: CLAIM_EXPIRES_MS); `abandoned`: un
 * intento más y resuelto con su error. `sent_at IS NULL`: nunca se reescribe un aviso ya resuelto.
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
        'UPDATE notifications SET attempts = attempts + 1, last_error = $1, claimed_at = $2 WHERE id = ANY($3::text[]) AND sent_at IS NULL',
        [error, at, ids],
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
