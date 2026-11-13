import type { NotificationData } from '@hueckoapp/shared';

// Cliente de la Expo Push API (https://docs.expo.dev/push-notifications/sending-notifications/). Solo envía: qué avisos
// mandar y qué hacer con cada resultado lo decide flush.ts.

export type PushMessage = {
  to: string;
  title: string;
  body: string;
  data: NotificationData;
  channelId: 'planes';
  priority: 'high';
  sound: 'default';
};

/** Un ticket por mensaje, en el mismo orden. `details.error === 'DeviceNotRegistered'`: ese token ya no sirve. */
export type PushTicket = { status: 'ok'; id: string } | { status: 'error'; message: string; details?: { error?: string } };

/** Error de red, espera agotada, 429 o 5xx: no se sabe si llegó; el lote se reintenta más tarde. */
export class PushTransportError extends Error {
  override name = 'PushTransportError';
}

export interface PushClient {
  /** Hasta 100 mensajes por llamada (más también funciona: el cliente de Expo los parte). */
  send(messages: PushMessage[]): Promise<PushTicket[]>;
}

export const EXPO_PUSH_URL = 'https://exp.host/--/api/v2/push/send';
/** Máximo de mensajes por petición que acepta Expo. */
export const PUSH_BATCH_SIZE = 100;
const TIMEOUT_MS_DEFAULT = 10_000;

export function createExpoPushClient({
  accessToken,
  fetchImpl = fetch,
  timeoutMs = TIMEOUT_MS_DEFAULT,
}: { accessToken?: string; fetchImpl?: typeof fetch; timeoutMs?: number }): PushClient {
  const headers: Record<string, string> = {
    accept: 'application/json',
    'accept-encoding': 'gzip, deflate',
    'content-type': 'application/json',
  };
  if (accessToken) headers.authorization = `Bearer ${accessToken}`;

  async function sendBatch(batch: PushMessage[]): Promise<PushTicket[]> {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeoutMs);
    let response: Response;
    let payload: unknown;
    try {
      response = await fetchImpl(EXPO_PUSH_URL, { method: 'POST', headers, body: JSON.stringify(batch), signal: controller.signal });
      payload = await response.json().catch(() => undefined);
    } catch (error) {
      const reason = controller.signal.aborted ? `sin respuesta en ${timeoutMs} ms` : error instanceof Error ? error.message : String(error);
      throw new PushTransportError(`No se pudo llamar a Expo: ${reason}`);
    } finally {
      clearTimeout(timer);
    }

    if (response.status === 429 || response.status >= 500) throw new PushTransportError(`Expo respondió ${response.status}`);
    if (!response.ok) {
      // 400 (u otro 4xx): el lote está mal y reintentarlo daría lo mismo; cada mensaje recibe el error.
      const message = `Expo respondió ${response.status}: ${errorsOf(payload) ?? 'petición rechazada'}`;
      return batch.map((): PushTicket => ({ status: 'error', message }));
    }
    const data = (payload as { data?: unknown } | undefined)?.data;
    if (!Array.isArray(data) || data.length !== batch.length) {
      throw new PushTransportError(`Expo respondió ${response.status} sin un ticket por mensaje`);
    }
    return data.map(toTicket);
  }

  return {
    async send(messages) {
      const tickets: PushTicket[] = [];
      for (let i = 0; i < messages.length; i += PUSH_BATCH_SIZE) {
        tickets.push(...(await sendBatch(messages.slice(i, i + PUSH_BATCH_SIZE))));
      }
      return tickets;
    },
  };
}

/** Los mensajes de `{ errors: [{ code, message }] }`, la forma de los errores de la petición entera. */
function errorsOf(payload: unknown): string | undefined {
  const errors = (payload as { errors?: unknown } | undefined)?.errors;
  if (!Array.isArray(errors) || errors.length === 0) return undefined;
  return errors.map((e: { code?: unknown; message?: unknown }) => String(e?.message ?? e?.code ?? '')).join('; ');
}

function toTicket(raw: unknown): PushTicket {
  const t = (raw ?? {}) as { status?: unknown; id?: unknown; message?: unknown; details?: { error?: unknown } };
  if (t.status === 'ok') return { status: 'ok', id: String(t.id ?? '') };
  const ticket: PushTicket = { status: 'error', message: String(t.message ?? 'error sin mensaje') };
  if (t.details && typeof t.details === 'object') ticket.details = typeof t.details.error === 'string' ? { error: t.details.error } : {};
  return ticket;
}
