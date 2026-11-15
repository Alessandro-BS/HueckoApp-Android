import { describe, expect, it, vi } from 'vitest';

import { createBrevoEmailClient } from '../src/email/brevo-client';
import { EmailSendError } from '../src/email/email-client';

const API_KEY = 'xkeysib-clave-secreta';
const MESSAGE = { to: 'ana@correo.com', subject: 'Tu código de HueckoApp: 123456', text: 'texto', html: '<p>html</p>' };
const make = (fetchImpl: typeof fetch, timeoutMs?: number) =>
  createBrevoEmailClient({ apiKey: API_KEY, senderEmail: 'avisos@hueckoapp.com', senderName: 'HueckoApp', fetchImpl, timeoutMs });
const reply = (status: number) => vi.fn(async () => new Response('{"message":"x"}', { status }));

describe('createBrevoEmailClient', () => {
  it('hace POST a la API de Brevo con la clave, las cabeceras y el cuerpo exactos', async () => {
    const fetchImpl = reply(201);
    await make(fetchImpl as unknown as typeof fetch).send(MESSAGE);
    expect(fetchImpl).toHaveBeenCalledTimes(1);
    const [url, init] = fetchImpl.mock.calls[0] as unknown as [string, RequestInit];
    expect(url).toBe('https://api.brevo.com/v3/smtp/email');
    expect(init.method).toBe('POST');
    expect(init.headers).toEqual({ 'api-key': API_KEY, 'content-type': 'application/json', accept: 'application/json' });
    expect(JSON.parse(init.body as string)).toEqual({
      sender: { email: 'avisos@hueckoapp.com', name: 'HueckoApp' },
      to: [{ email: 'ana@correo.com' }],
      subject: MESSAGE.subject,
      textContent: 'texto',
      htmlContent: '<p>html</p>',
    });
  });

  it.each([400, 401, 500])('el estado %i lanza EmailSendError con el estado y sin la clave', async (status) => {
    const error = await make(reply(status) as unknown as typeof fetch).send(MESSAGE).catch((e: unknown) => e);
    expect(error).toBeInstanceOf(EmailSendError);
    expect((error as Error).message).toContain(String(status));
    expect((error as Error).message).not.toContain(API_KEY);
  });

  it('red caída: EmailSendError sin la clave', async () => {
    const fetchImpl = vi.fn(async () => {
      throw new TypeError(`fetch failed ${API_KEY}`);
    }) as unknown as typeof fetch;
    const error = await make(fetchImpl).send(MESSAGE).catch((e: unknown) => e);
    expect(error).toBeInstanceOf(EmailSendError);
    expect((error as Error).message).not.toContain(API_KEY);
  });

  it('espera agotada: EmailSendError', async () => {
    const fetchImpl = ((_url: string, init: RequestInit) =>
      new Promise((_resolve, reject) => {
        init.signal?.addEventListener('abort', () => reject(new DOMException('aborted', 'AbortError')));
      })) as unknown as typeof fetch;
    await expect(make(fetchImpl, 10).send(MESSAGE)).rejects.toBeInstanceOf(EmailSendError);
  });
});
