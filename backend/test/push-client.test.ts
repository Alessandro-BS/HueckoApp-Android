import { describe, expect, it } from 'vitest';

import { createExpoPushClient, type PushMessage, PushTransportError } from '../src/notifications/push-client';

// El cliente de la Expo Push API con un `fetch` falso: nunca sale a la red.

const EXPO_URL = 'https://exp.host/--/api/v2/push/send';

const message = (i: number): PushMessage => ({
  to: `ExponentPushToken[${i}]`,
  title: 'Proyecto Integrador',
  body: `Aviso ${i}`,
  data: { kind: 'NEW_PROPOSAL', proposalId: 'p1', groupId: 'g1', screen: 'VOTING' },
  channelId: 'planes',
  priority: 'high',
  sound: 'default',
});
const messages = (n: number) => Array.from({ length: n }, (_, i) => message(i));

type Call = { url: string; init: RequestInit; body: PushMessage[]; headers: Headers };

/** `fetch` falso: guarda cada petición y responde con `reply` (por defecto, un ticket `ok` por mensaje). */
function fakeFetch(reply?: (body: PushMessage[], call: number) => Response | Promise<Response>) {
  const calls: Call[] = [];
  const fetchImpl = (async (url: string | URL | Request, init: RequestInit = {}) => {
    const body = JSON.parse(String(init.body)) as PushMessage[];
    calls.push({ url: String(url), init, body, headers: new Headers(init.headers) });
    if (reply) return reply(body, calls.length);
    return Response.json({ data: body.map((m) => ({ status: 'ok', id: `ticket-${m.body}` })) });
  }) as typeof fetch;
  return { fetchImpl, calls };
}

describe('createExpoPushClient', () => {
  it('100 mensajes van en una sola petición y vuelven 100 tickets en orden', async () => {
    const { fetchImpl, calls } = fakeFetch();
    const tickets = await createExpoPushClient({ fetchImpl }).send(messages(100));

    expect(calls).toHaveLength(1);
    expect(calls[0]!.url).toBe(EXPO_URL);
    expect(calls[0]!.init.method).toBe('POST');
    expect(calls[0]!.body).toEqual(messages(100));
    expect(tickets).toEqual(messages(100).map((m) => ({ status: 'ok', id: `ticket-${m.body}` })));
  });

  it('más de 100 mensajes en una llamada: rechaza sin hacer ninguna petición (quien llama parte los lotes)', async () => {
    const { fetchImpl, calls } = fakeFetch();
    const sending = createExpoPushClient({ fetchImpl }).send(messages(101));
    await expect(sending).rejects.toThrow(/100/);
    await expect(sending).rejects.not.toBeInstanceOf(PushTransportError);
    expect(calls).toHaveLength(0);
  });

  it('cabeceras de la API; Authorization solo con token', async () => {
    const without = fakeFetch();
    await createExpoPushClient({ fetchImpl: without.fetchImpl }).send(messages(1));
    const headers = without.calls[0]!.headers;
    expect(headers.get('accept')).toBe('application/json');
    expect(headers.get('accept-encoding')).toBe('gzip, deflate');
    expect(headers.get('content-type')).toBe('application/json');
    expect(headers.has('authorization')).toBe(false);

    const withToken = fakeFetch();
    await createExpoPushClient({ accessToken: 'token-de-expo', fetchImpl: withToken.fetchImpl }).send(messages(1));
    expect(withToken.calls[0]!.headers.get('authorization')).toBe('Bearer token-de-expo');
  });

  it('sin mensajes no hace ninguna petición', async () => {
    const { fetchImpl, calls } = fakeFetch();
    expect(await createExpoPushClient({ fetchImpl }).send([])).toEqual([]);
    expect(calls).toHaveLength(0);
  });

  it('tickets de error tal como los da Expo (DeviceNotRegistered)', async () => {
    const { fetchImpl } = fakeFetch(async () =>
      Response.json({
        data: [
          { status: 'ok', id: 'a' },
          { status: 'error', message: '"ExponentPushToken[1]" is not a registered push notification recipient', details: { error: 'DeviceNotRegistered' } },
        ],
      }),
    );
    expect(await createExpoPushClient({ fetchImpl }).send(messages(2))).toEqual([
      { status: 'ok', id: 'a' },
      { status: 'error', message: '"ExponentPushToken[1]" is not a registered push notification recipient', details: { error: 'DeviceNotRegistered' } },
    ]);
  });

  it('5xx, 429 y cualquier 4xx que no sea 400 ni 413 (p. ej. 401 por un token de acceso mal puesto) → PushTransportError', async () => {
    for (const status of [503, 500, 429, 401, 403, 404, 408]) {
      const { fetchImpl } = fakeFetch(async () => new Response('caído', { status }));
      await expect(createExpoPushClient({ fetchImpl }).send(messages(1))).rejects.toBeInstanceOf(PushTransportError);
    }
  });

  it('error de red → PushTransportError', async () => {
    const fetchImpl = (async () => {
      throw new TypeError('fetch failed');
    }) as typeof fetch;
    await expect(createExpoPushClient({ fetchImpl }).send(messages(1))).rejects.toBeInstanceOf(PushTransportError);
  });

  it('sin respuesta antes de timeoutMs → PushTransportError (la petición se aborta)', async () => {
    let aborted = false;
    const fetchImpl = ((_url: string, init: RequestInit) =>
      new Promise<Response>((_resolve, reject) => {
        init.signal!.addEventListener('abort', () => {
          aborted = true;
          reject(new DOMException('This operation was aborted', 'AbortError'));
        });
      })) as unknown as typeof fetch;
    await expect(createExpoPushClient({ fetchImpl, timeoutMs: 20 }).send(messages(1))).rejects.toBeInstanceOf(PushTransportError);
    expect(aborted).toBe(true);
  });

  it('una respuesta 200 con otra cantidad de tickets → PushTransportError (no se puede saber cuál es cuál)', async () => {
    const { fetchImpl } = fakeFetch(async () => Response.json({ data: [{ status: 'ok', id: 'a' }] }));
    await expect(createExpoPushClient({ fetchImpl }).send(messages(2))).rejects.toBeInstanceOf(PushTransportError);
  });

  it('400 y 413 → un ticket de error por cada mensaje del lote (no se reintenta)', async () => {
    const { fetchImpl } = fakeFetch(async () =>
      Response.json({ errors: [{ code: 'VALIDATION_ERROR', message: '"to" must be a string' }] }, { status: 400 }),
    );
    const tickets = await createExpoPushClient({ fetchImpl }).send(messages(3));
    expect(tickets).toHaveLength(3);
    for (const ticket of tickets) expect(ticket).toEqual({ status: 'error', message: expect.stringContaining('"to" must be a string') });

    const tooLarge = fakeFetch(async () => new Response('Payload Too Large', { status: 413 }));
    expect(await createExpoPushClient({ fetchImpl: tooLarge.fetchImpl }).send(messages(2))).toEqual([
      { status: 'error', message: expect.stringContaining('413') },
      { status: 'error', message: expect.stringContaining('413') },
    ]);
  });
});
