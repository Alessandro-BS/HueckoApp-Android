import type { User } from '@hueckoapp/shared';
import type { Express } from 'express';
import request from 'supertest';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import type { Db } from '../src/db/db';
import { devicesRepository } from '../src/notifications/devices.repository';
import { flushNotifications } from '../src/notifications/flush';
import { createFlushScheduler } from '../src/notifications/flush-scheduler';
import { enqueue, type OutboxItem } from '../src/notifications/outbox.repository';
import type { PushMessage } from '../src/notifications/push-client';
import {
  bearer, createGroup, createProposal, DEADLINE, fakePush, interleave, joinGroup, makeTestApp, NOW, registerUser, win,
} from './helpers';

// El envío: reclama los avisos pendientes en una transacción corta, la cierra, llama a Expo (aquí, un cliente falso) y
// anota el resultado de cada aviso.

type Member = { token: string; user: User };
type Row = { id: string; user_id: string; sent_at: string | null; claimed_at: string | null; attempts: number; last_error: string | null };

let app: Express;
let db: Db;
let ana: Member;
let carlos: Member;

const MINUTE = 60_000;
const later = (minutes: number) => new Date(NOW.getTime() + minutes * MINUTE);
const TOKEN_A1 = 'ExponentPushToken[ana-1]';
const TOKEN_A2 = 'ExponentPushToken[ana-2]';
const TOKEN_C = 'ExponentPushToken[carlos]';

beforeEach(async () => {
  ({ app, db } = await makeTestApp());
  ana = await registerUser(app, { name: 'Ana' });
  carlos = await registerUser(app, { name: 'Carlos' });
});

const item = (member: Member, body = 'Yo propuso «Plan». Vota tus franjas.'): OutboxItem => ({
  userId: member.user.id,
  kind: 'NEW_PROPOSAL',
  title: 'Proyecto Integrador',
  body,
  data: { kind: 'NEW_PROPOSAL', proposalId: 'p1', groupId: 'g1', screen: 'VOTING' },
});
const addDevice = (member: Member, token: string, at = NOW) => devicesRepository(db).upsert(member.user.id, token, at);
const rows = () => db.many<Row>('SELECT id, user_id, sent_at, claimed_at, attempts, last_error FROM notifications ORDER BY seq');
const pending = async () => (await rows()).filter((r) => r.sent_at === null);
const tokensOf = async (member: Member) => (await devicesRepository(db).tokensOf([member.user.id])).get(member.user.id) ?? [];

describe('flushNotifications', () => {
  it('un aviso a alguien con dos celulares: dos mensajes (uno por token) y queda enviado', async () => {
    await addDevice(ana, TOKEN_A1);
    await addDevice(ana, TOKEN_A2, later(1));
    await enqueue(db, [item(ana)], NOW);
    const push = fakePush();

    expect(await flushNotifications(db, push, later(2))).toEqual({ sent: 1, failed: 0 });

    const message = (to: string): PushMessage => ({
      to,
      title: 'Proyecto Integrador',
      body: 'Yo propuso «Plan». Vota tus franjas.',
      data: { kind: 'NEW_PROPOSAL', proposalId: 'p1', groupId: 'g1', screen: 'VOTING' },
      channelId: 'planes',
      priority: 'high',
      sound: 'default',
    });
    expect(push.calls).toEqual([[message(TOKEN_A1), message(TOKEN_A2)]]);
    const [row] = await rows();
    expect(row).toMatchObject({ sent_at: later(2).toISOString(), attempts: 0, last_error: null });
  });

  it('sin celulares: queda enviado sin mandar nada', async () => {
    await enqueue(db, [item(ana)], NOW);
    const push = fakePush();

    expect(await flushNotifications(db, push, later(1))).toEqual({ sent: 1, failed: 0 });
    expect(push.calls).toEqual([]);
    expect((await rows())[0]).toMatchObject({ sent_at: later(1).toISOString(), last_error: null });
  });

  it('sin nada pendiente no llama a Expo', async () => {
    const push = fakePush();
    expect(await flushNotifications(db, push, NOW)).toEqual({ sent: 0, failed: 0 });
    expect(push.calls).toEqual([]);
  });

  it('PushTransportError: attempts 1, sigue pendiente y reclamado; se reintenta solo cuando vence el reclamo (5 min)', async () => {
    await addDevice(ana, TOKEN_A1);
    await enqueue(db, [item(ana)], NOW);
    const push = fakePush('transport');

    expect(await flushNotifications(db, push, later(1))).toEqual({ sent: 0, failed: 1 });
    expect((await rows())[0]).toMatchObject({
      sent_at: null,
      claimed_at: later(1).toISOString(),
      attempts: 1,
      last_error: expect.stringContaining('503'),
    });

    // El reclamo hace de espera: antes de 5 min no se reintenta (aunque Expo ya responda).
    push.reply('ok');
    expect(await flushNotifications(db, push, later(5))).toEqual({ sent: 0, failed: 0 });
    expect(push.calls).toHaveLength(1);

    expect(await flushNotifications(db, push, later(7))).toEqual({ sent: 1, failed: 0 });
    expect(push.calls).toHaveLength(2);
    expect((await rows())[0]).toMatchObject({ sent_at: later(7).toISOString(), attempts: 1 });
  });

  it('al quinto fallo se abandona: sent_at y last_error, y ya no se reintenta', async () => {
    await addDevice(ana, TOKEN_A1);
    await enqueue(db, [item(ana)], NOW);
    const push = fakePush('transport');

    // Cada reintento, pasado el reclamo anterior (6 min después).
    for (let i = 1; i <= 4; i++) {
      await flushNotifications(db, push, later(i * 6));
      expect((await rows())[0]).toMatchObject({ sent_at: null, attempts: i });
    }
    expect(await flushNotifications(db, push, later(30))).toEqual({ sent: 0, failed: 1 });
    expect((await rows())[0]).toMatchObject({ sent_at: later(30).toISOString(), attempts: 5, last_error: expect.stringContaining('503') });

    push.reply('ok');
    expect(await flushNotifications(db, push, later(60))).toEqual({ sent: 0, failed: 0 });
    expect(push.calls).toHaveLength(5);
  });

  it('MessageRateExceeded sin ningún ok se reintenta como un error de transporte; con otro token ok queda enviado', async () => {
    await addDevice(ana, TOKEN_A1);
    await addDevice(carlos, TOKEN_C);
    await addDevice(carlos, TOKEN_A2, later(1)); // segundo celular de Carlos
    await enqueue(db, [item(ana), item(carlos)], NOW);
    // Ana: su único token, MessageRateExceeded. Carlos: uno MessageRateExceeded y el otro ok.
    const push = fakePush((m) => (m.to === TOKEN_A2 ? 'ok' : 'MessageRateExceeded'));

    expect(await flushNotifications(db, push, later(2))).toEqual({ sent: 1, failed: 1 });
    const [anaRow, carlosRow] = await rows();
    expect(anaRow).toMatchObject({
      sent_at: null,
      claimed_at: later(2).toISOString(),
      attempts: 1,
      last_error: expect.stringContaining('MessageRateExceeded'),
    });
    expect(carlosRow).toMatchObject({ sent_at: later(2).toISOString(), attempts: 0 });
    expect(await tokensOf(ana)).toEqual([TOKEN_A1]); // no es un token muerto

    push.reply('ok');
    expect(await flushNotifications(db, push, later(8))).toEqual({ sent: 1, failed: 0 });
    expect(await pending()).toEqual([]);
  });

  it('MessageRateExceeded en un token y DeviceNotRegistered en otro: se borra el muerto y se reintenta', async () => {
    await addDevice(ana, TOKEN_A1);
    await addDevice(ana, TOKEN_A2, later(1));
    await enqueue(db, [item(ana)], NOW);
    const push = fakePush((m) => (m.to === TOKEN_A1 ? 'DeviceNotRegistered' : 'MessageRateExceeded'));

    expect(await flushNotifications(db, push, later(2))).toEqual({ sent: 0, failed: 1 });
    expect(await tokensOf(ana)).toEqual([TOKEN_A2]);
    expect((await rows())[0]).toMatchObject({ sent_at: null, attempts: 1 });
  });

  it('DeviceNotRegistered borra ese token; con otro token ok el aviso queda enviado', async () => {
    await addDevice(ana, TOKEN_A1);
    await addDevice(ana, TOKEN_A2, later(1));
    await enqueue(db, [item(ana)], NOW);
    const push = fakePush((m) => (m.to === TOKEN_A1 ? 'DeviceNotRegistered' : 'ok'));

    expect(await flushNotifications(db, push, later(2))).toEqual({ sent: 1, failed: 0 });
    expect(await tokensOf(ana)).toEqual([TOKEN_A2]);
    expect((await rows())[0]!.sent_at).toBe(later(2).toISOString());
  });

  it('todos sus tokens con DeviceNotRegistered: se borran y el aviso queda enviado (no hay nada que reintentar)', async () => {
    await addDevice(ana, TOKEN_A1);
    await addDevice(ana, TOKEN_A2, later(1));
    await addDevice(carlos, TOKEN_C);
    await enqueue(db, [item(ana)], NOW);
    const push = fakePush('DeviceNotRegistered');

    await flushNotifications(db, push, later(2));
    expect(await tokensOf(ana)).toEqual([]);
    expect(await tokensOf(carlos)).toEqual([TOKEN_C]);
    expect((await rows())[0]).toMatchObject({ sent_at: later(2).toISOString(), attempts: 0, last_error: expect.stringContaining('DeviceNotRegistered') });
  });

  it('un reclamo de más de 5 min se reintenta; uno reciente no', async () => {
    await addDevice(ana, TOKEN_A1);
    await addDevice(carlos, TOKEN_C);
    await enqueue(db, [item(ana), item(carlos)], NOW);
    // Otro envío reclamó los dos y murió a mitad: el de Ana hace 6 min, el de Carlos hace 4.
    await db.query('UPDATE notifications SET claimed_at = $1 WHERE user_id = $2', [later(4).toISOString(), ana.user.id]);
    await db.query('UPDATE notifications SET claimed_at = $1 WHERE user_id = $2', [later(6).toISOString(), carlos.user.id]);
    const push = fakePush();

    expect(await flushNotifications(db, push, later(10))).toEqual({ sent: 1, failed: 0 });
    expect(push.calls.flat().map((m) => m.to)).toEqual([TOKEN_A1]);
    expect((await pending()).map((r) => r.user_id)).toEqual([carlos.user.id]);
  });

  it('250 pendientes: tres pasadas (100 + 100 + 50) los envían todos sin repetir', async () => {
    await addDevice(ana, TOKEN_A1);
    await enqueue(db, Array.from({ length: 250 }, (_, i) => item(ana, `Aviso ${i}`)), NOW);
    const push = fakePush();

    for (const expected of [100, 100, 50]) {
      expect(await flushNotifications(db, push, later(1))).toEqual({ sent: expected, failed: 0 });
    }
    expect(await flushNotifications(db, push, later(1))).toEqual({ sent: 0, failed: 0 });
    const bodies = push.calls.flat().map((m) => m.body);
    expect(bodies).toHaveLength(250);
    expect(new Set(bodies).size).toBe(250);
    expect(bodies[0]).toBe('Aviso 0'); // en orden de llegada (seq)
    expect(await pending()).toEqual([]);
  });

  it('llama a Expo con el reclamo ya guardado y fuera de la transacción', async () => {
    await addDevice(ana, TOKEN_A1);
    await enqueue(db, [item(ana)], NOW);
    const push = fakePush();
    const seen: { inTransaction: boolean; claimedAt: string | null }[] = [];
    const send = push.send.bind(push);
    push.send = async (messages) => {
      seen.push({ inTransaction: db.inTransaction, claimedAt: (await rows())[0]!.claimed_at });
      return send(messages);
    };

    await flushNotifications(db, push, later(1));
    expect(seen).toEqual([{ inTransaction: false, claimedAt: later(1).toISOString() }]);
  });

  it('el reclamo usa FOR UPDATE SKIP LOCKED: si otro envío ya reclamó las filas, este no las manda', async () => {
    await addDevice(ana, TOKEN_A1);
    await enqueue(db, [item(ana), item(ana, 'Otro')], NOW);
    // Otro envío reclamó las filas y confirmó justo antes del SELECT de este.
    interleave(db, /FOR UPDATE SKIP LOCKED/, 'UPDATE notifications SET claimed_at = $1', [later(1).toISOString()]);
    const push = fakePush();

    expect(await flushNotifications(db, push, later(1))).toEqual({ sent: 0, failed: 0 });
    expect(push.calls).toEqual([]);
    expect(await pending()).toHaveLength(2);
  });

  it('dos envíos seguidos o a la vez mandan cada aviso una sola vez', async () => {
    await addDevice(ana, TOKEN_A1);
    await addDevice(carlos, TOKEN_C);
    await enqueue(db, [item(ana), item(carlos), item(ana, 'Otro')], NOW);
    const push = fakePush();

    const results = await Promise.all([flushNotifications(db, push, later(1)), flushNotifications(db, push, later(1))]);
    expect(results.reduce((n, r) => n + r.sent, 0)).toBe(3);
    await flushNotifications(db, push, later(2));
    expect(push.calls.flat().map((m) => `${m.to} ${m.body}`).sort()).toEqual(
      [`${TOKEN_A1} ${item(ana).body}`, `${TOKEN_A1} Otro`, `${TOKEN_C} ${item(carlos).body}`].sort(),
    );
  });

  it('nunca lanza: si la base falla devuelve ceros, y un error inesperado de Expo cuenta como fallo', async () => {
    await addDevice(ana, TOKEN_A1);
    await enqueue(db, [item(ana)], NOW);
    const push = fakePush();
    push.send = async () => {
      throw new Error('algo raro');
    };
    expect(await flushNotifications(db, push, later(1))).toEqual({ sent: 0, failed: 1 });
    expect((await rows())[0]).toMatchObject({ sent_at: null, claimed_at: later(1).toISOString(), attempts: 1, last_error: 'algo raro' });

    vi.spyOn(db, 'transaction').mockRejectedValueOnce(new Error('base caída'));
    await expect(flushNotifications(db, push, later(2))).resolves.toEqual({ sent: 0, failed: 0 });
  });
});

describe('createFlushScheduler', () => {
  it('como mucho un envío en curso y uno pendiente; cada pedido se atiende', async () => {
    await addDevice(ana, TOKEN_A1);
    await enqueue(db, [item(ana)], NOW);
    const push = fakePush();
    const send = push.send.bind(push);
    let release!: () => void;
    const gate = new Promise<void>((resolve) => {
      release = resolve;
    });
    let inFlight = 0;
    let maxInFlight = 0;
    push.send = async (messages) => {
      inFlight++;
      maxInFlight = Math.max(maxInFlight, inFlight);
      await gate;
      inFlight--;
      return send(messages);
    };
    const tasks: Promise<void>[] = [];
    // Cada envío abre una sola transacción (la del reclamo): contarlas cuenta los envíos.
    const flushes = vi.spyOn(db, 'transaction');
    const scheduler = createFlushScheduler({ db, push, now: () => later(1), onBackgroundTask: (t) => tasks.push(t) });

    scheduler.kick();
    await vi.waitFor(() => expect(inFlight).toBe(1));
    // Mientras el primero espera a Expo llegan tres pedidos más (y un aviso nuevo): se juntan en uno pendiente.
    await enqueue(db, [item(ana, 'Nuevo')], NOW);
    scheduler.kick();
    scheduler.kick();
    scheduler.kick();
    release();
    await Promise.all(tasks);

    expect(tasks).toHaveLength(1);
    expect(flushes).toHaveBeenCalledTimes(2);
    expect(maxInFlight).toBe(1);
    expect(push.calls.flat().map((m) => m.body)).toEqual([item(ana).body, 'Nuevo']);

    // Ya en reposo, un pedido nuevo arranca otro envío.
    scheduler.kick();
    await Promise.all(tasks);
    expect(tasks).toHaveLength(2);
    expect(flushes).toHaveBeenCalledTimes(3);
  });

  it('nunca lanza: un envío que falla no corta los siguientes', async () => {
    await enqueue(db, [item(ana)], NOW);
    const tasks: Promise<void>[] = [];
    const now = vi.fn<() => Date>().mockImplementationOnce(() => {
      throw new Error('reloj roto');
    });
    now.mockReturnValue(later(1));
    const scheduler = createFlushScheduler({ db, push: fakePush(), now, onBackgroundTask: (t) => tasks.push(t) });

    expect(() => scheduler.kick()).not.toThrow();
    await expect(Promise.all(tasks)).resolves.toBeDefined();
    expect(await pending()).toHaveLength(1);
    scheduler.kick();
    await Promise.all(tasks);
    expect(await pending()).toEqual([]);
  });
});

describe('envío inmediato tras cada petición', () => {
  it('con un cliente inyectado, crear una propuesta manda el NEW_PROPOSAL a los otros miembros', async () => {
    const push = fakePush();
    const tasks: Promise<void>[] = [];
    ({ app, db } = await makeTestApp({ now: () => NOW, push, onBackgroundTask: (t) => tasks.push(t) }));
    const yo = await registerUser(app, { name: 'Yo' });
    const otra = await registerUser(app, { name: 'Ana' });
    const group = await createGroup(app, yo.token, { name: 'Proyecto Integrador' });
    await joinGroup(app, otra.token, group.inviteCode);
    await request(app).put('/api/me/push-devices').set(bearer(otra.token)).send({ token: TOKEN_A1 }).expect(204);
    await request(app).put('/api/me/push-devices').set(bearer(yo.token)).send({ token: TOKEN_C }).expect(204);
    await Promise.all(tasks);
    expect(push.calls).toEqual([]);

    const p = await createProposal(app, yo.token, group.id, { title: 'Reunión', votingDeadline: DEADLINE, windows: [win(3, '11:00', '13:00'), win(6, '11:00', '13:00')] });
    await vi.waitFor(() => expect(tasks.length).toBeGreaterThan(0));
    await Promise.all(tasks);

    expect(push.calls.flat()).toEqual([
      {
        to: TOKEN_A1,
        title: 'Proyecto Integrador',
        body: 'Yo propuso «Reunión». Vota tus franjas.',
        data: { kind: 'NEW_PROPOSAL', proposalId: p.id, groupId: group.id, screen: 'VOTING' },
        channelId: 'planes',
        priority: 'high',
        sound: 'default',
      },
    ]);
    expect(await pending()).toEqual([]);
  });

  it('sin cliente inyectado no se pide ningún envío', async () => {
    const tasks: Promise<void>[] = [];
    ({ app, db } = await makeTestApp({ now: () => NOW, onBackgroundTask: (t) => tasks.push(t) }));
    const yo = await registerUser(app, { name: 'Yo' });
    await createGroup(app, yo.token);
    await request(app).get('/api/health').expect(200);
    expect(tasks).toEqual([]);
  });
});
