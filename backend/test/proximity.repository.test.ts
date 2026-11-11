import { describe, expect, it } from 'vitest';

import { groupsRepository } from '../src/groups/groups.repository';
import { CONFIRM_TTL_MS, effectiveStatus, PROXIMITY_LOCK_ID, WAITING_TTL_MS } from '../src/proximity/proximity-rules';
import { type ProximityRow, proximityRepository } from '../src/proximity/proximity.repository';
import { usersRepository } from '../src/users/users.repository';
import { makeTestDb, NOW, recordQueries } from './helpers';

const at = (ms: number) => new Date(NOW.getTime() + ms);
const createdAt = NOW.toISOString();

// Ana (dueña del grupo), Beto, Carla y Dani (sin grupo), y Memo, que ya es miembro.
const setup = async () => {
  const db = await makeTestDb();
  const users = usersRepository(db);
  const user = (name: string) => users.create({ name, email: `${name.toLowerCase()}@correo.com`, passwordHash: 'x', createdAt });
  const [ana, beto, carla, dani, memo] = await Promise.all(['Ana', 'Beto', 'Carla', 'Dani', 'Memo'].map(user));
  const groups = groupsRepository(db);
  const group = await groups.create(ana.id, { name: 'Grupo', description: '', availabilityThreshold: 80, createdAt });
  const otherGroup = await groups.create(dani.id, { name: 'Otro', description: '', availabilityThreshold: 80, createdAt });
  await groups.addMember(group.id, memo.id);
  const repo = proximityRepository(db);
  // Estado guardado de un intento, leído de nuevo de la base.
  const statusOf = async (row: ProximityRow) => (await repo.findOwn(row.id, row.user_id))!.status;
  return { db, repo, statusOf, ana, beto, carla, dani, memo, group, otherGroup };
};

describe('proximityRepository.create — emparejamiento', () => {
  it('lo primero, dentro de su transacción, es el candado de proximidad', async () => {
    // PGlite tiene una sola conexión y no puede reproducir la carrera: este test impide que un cambio quite el candado.
    const { db, repo, ana, group } = await setup();
    const calls = recordQueries(db);
    await repo.create(ana.id, 'INVITE', group.id, NOW);
    expect(calls[0]).toEqual({ sql: 'SELECT pg_advisory_xact_lock($1)', params: [PROXIMITY_LOCK_ID], inTransaction: true });
    expect(calls.some((c) => !c.inTransaction)).toBe(false);
  });

  it('empareja una invitación y una unión a menos de 3 s', async () => {
    const { repo, ana, beto, group } = await setup();
    const invite = await repo.create(ana.id, 'INVITE', group.id, NOW);
    expect(invite).toMatchObject({ user_id: ana.id, role: 'INVITE', group_id: group.id, status: 'WAITING', peer_id: null, created_at: createdAt, matched_at: null });
    const join = await repo.create(beto.id, 'JOIN', null, at(2999));
    const matchedAt = at(2999).toISOString();
    expect(join).toMatchObject({ role: 'JOIN', group_id: null, status: 'MATCHED', peer_id: invite.id, matched_at: matchedAt });
    expect(await repo.findPeer(join)).toMatchObject({ id: invite.id, status: 'MATCHED', peer_id: join.id, matched_at: matchedAt });
  });

  it('no empareja a 3,1 s', async () => {
    const { repo, statusOf, ana, beto, group } = await setup();
    const invite = await repo.create(ana.id, 'INVITE', group.id, NOW);
    const join = await repo.create(beto.id, 'JOIN', null, at(3100));
    expect(join.status).toBe('WAITING');
    expect(await statusOf(invite)).toBe('WAITING');
  });

  it('dos candidatos → todos AMBIGUOUS', async () => {
    const { repo, statusOf, ana, dani, beto, group, otherGroup } = await setup();
    const first = await repo.create(ana.id, 'INVITE', group.id, NOW);
    const second = await repo.create(dani.id, 'INVITE', otherGroup.id, at(500));
    const join = await repo.create(beto.id, 'JOIN', null, at(1000));
    expect(join.status).toBe('AMBIGUOUS');
    expect([await statusOf(first), await statusOf(second)]).toEqual(['AMBIGUOUS', 'AMBIGUOUS']);
  });

  it('un aviso que llega ≤ 3 s después de una pareja la anula', async () => {
    const { repo, statusOf, ana, beto, carla, group } = await setup();
    const a = await repo.create(ana.id, 'INVITE', group.id, NOW);
    const b = await repo.create(beto.id, 'JOIN', null, at(400));
    expect(b.status).toBe('MATCHED'); // control
    const c = await repo.create(carla.id, 'JOIN', null, at(800));
    expect(c.status).toBe('AMBIGUOUS');
    expect([await statusOf(a), await statusOf(b)]).toEqual(['AMBIGUOUS', 'AMBIGUOUS']);
  });

  it('una invitación nueva que llega ≤ 3 s después de una pareja también la anula (hacia adelante, rol INVITE)', async () => {
    const { repo, statusOf, ana, beto, dani, group, otherGroup } = await setup();
    const a = await repo.create(ana.id, 'INVITE', group.id, NOW);
    const b = await repo.create(beto.id, 'JOIN', null, at(400));
    expect(b.status).toBe('MATCHED'); // control
    const d = await repo.create(dani.id, 'INVITE', otherGroup.id, at(800));
    expect(d.status).toBe('AMBIGUOUS');
    expect([await statusOf(a), await statusOf(b)]).toEqual(['AMBIGUOUS', 'AMBIGUOUS']);
  });

  it('una invitación nueva no anula una pareja cuyo JOIN ya es miembro de su grupo', async () => {
    const { db, repo, statusOf, ana, beto, dani, group, otherGroup } = await setup();
    await groupsRepository(db).addMember(otherGroup.id, beto.id);
    const a = await repo.create(ana.id, 'INVITE', group.id, NOW);
    const b = await repo.create(beto.id, 'JOIN', null, at(400));
    const d = await repo.create(dani.id, 'INVITE', otherGroup.id, at(800));
    expect(d.status).toBe('WAITING');
    expect([await statusOf(a), await statusOf(b)]).toEqual(['MATCHED', 'MATCHED']);
  });

  it('un aviso que llega 3,1 s después de una pareja no la toca', async () => {
    const { repo, statusOf, ana, beto, carla, group } = await setup();
    const a = await repo.create(ana.id, 'INVITE', group.id, NOW);
    const b = await repo.create(beto.id, 'JOIN', null, at(400));
    const c = await repo.create(carla.id, 'JOIN', null, at(400 + 3100));
    expect(c.status).toBe('WAITING');
    expect([await statusOf(a), await statusOf(b)]).toEqual(['MATCHED', 'MATCHED']);
  });

  it('no anula una pareja con la unión de quien ya es miembro de su grupo', async () => {
    const { repo, statusOf, ana, beto, memo, group } = await setup();
    const a = await repo.create(ana.id, 'INVITE', group.id, NOW);
    const b = await repo.create(beto.id, 'JOIN', null, at(400));
    const m = await repo.create(memo.id, 'JOIN', null, at(800));
    expect(m.status).toBe('WAITING');
    expect([await statusOf(a), await statusOf(b)]).toEqual(['MATCHED', 'MATCHED']);
  });

  it('no se empareja consigo mismo', async () => {
    const { repo, statusOf, ana, group } = await setup();
    const invite = await repo.create(ana.id, 'INVITE', group.id, NOW);
    const join = await repo.create(ana.id, 'JOIN', null, at(1000));
    expect(join.status).toBe('WAITING');
    expect(await statusOf(invite)).toBe('CANCELLED');
  });

  it('un aviso nuevo cancela el anterior y a su pareja', async () => {
    const { repo, statusOf, ana, beto, group } = await setup();
    const invite = await repo.create(ana.id, 'INVITE', group.id, NOW);
    const join = await repo.create(beto.id, 'JOIN', null, at(1000));
    const again = await repo.create(beto.id, 'JOIN', null, at(10_000));
    expect(again.status).toBe('WAITING');
    expect([await statusOf(invite), await statusOf(join)]).toEqual(['CANCELLED', 'CANCELLED']);
  });

  it('un aviso nuevo no toca un intento anterior ya vencido', async () => {
    const { repo, statusOf, ana, group } = await setup();
    const old = await repo.create(ana.id, 'INVITE', group.id, NOW);
    await repo.create(ana.id, 'INVITE', group.id, at(WAITING_TTL_MS));
    expect(await statusOf(old)).toBe('WAITING'); // guardado así; effectiveStatus lo lee como EXPIRED
  });

  it('ignora la unión de quien ya es miembro', async () => {
    const { repo, statusOf, ana, memo, group } = await setup();
    const invite = await repo.create(ana.id, 'INVITE', group.id, NOW);
    const join = await repo.create(memo.id, 'JOIN', null, at(1000));
    expect(join.status).toBe('WAITING');
    expect(await statusOf(invite)).toBe('WAITING');
  });

  it('una invitación ignora la unión que espera de quien ya es miembro', async () => {
    const { repo, statusOf, ana, memo, group } = await setup();
    const join = await repo.create(memo.id, 'JOIN', null, NOW);
    const invite = await repo.create(ana.id, 'INVITE', group.id, at(1000));
    expect(invite.status).toBe('WAITING');
    expect(await statusOf(join)).toBe('WAITING');
  });
});

describe('proximityRepository — lectura y cambios', () => {
  it('findOwn solo devuelve intentos del propio usuario', async () => {
    const { repo, ana, beto, group } = await setup();
    const invite = await repo.create(ana.id, 'INVITE', group.id, NOW);
    expect(await repo.findOwn(invite.id, ana.id)).toEqual(invite);
    expect(await repo.findOwn(invite.id, beto.id)).toBeUndefined();
  });

  it('findPeer no devuelve nada sin pareja, y setPairStatus cambia las dos mitades', async () => {
    const { repo, statusOf, ana, beto, group } = await setup();
    const invite = await repo.create(ana.id, 'INVITE', group.id, NOW);
    expect(await repo.findPeer(invite)).toBeUndefined();
    const join = await repo.create(beto.id, 'JOIN', null, at(1000));
    await repo.setPairStatus(join, 'ACCEPTED');
    expect([await statusOf(invite), await statusOf(join)]).toEqual(['ACCEPTED', 'ACCEPTED']);
  });
});

describe('effectiveStatus', () => {
  const row = (status: ProximityRow['status'], matchedAt: string | null): ProximityRow => ({
    id: 'p', user_id: 'u', role: 'JOIN', group_id: null, status, peer_id: null, created_at: createdAt, matched_at: matchedAt,
  });

  it('effectiveStatus vence WAITING a los 5 s y MATCHED a los 30 s', () => {
    expect(WAITING_TTL_MS).toBe(5000);
    expect(CONFIRM_TTL_MS).toBe(30_000);
    expect(effectiveStatus(row('WAITING', null), at(4999))).toBe('WAITING');
    expect(effectiveStatus(row('WAITING', null), at(5000))).toBe('EXPIRED');
    // MATCHED cuenta desde matched_at, no desde created_at.
    const matched = row('MATCHED', at(2000).toISOString());
    expect(effectiveStatus(matched, at(31_999))).toBe('MATCHED');
    expect(effectiveStatus(matched, at(32_000))).toBe('EXPIRED');
  });

  it('los estados finales no cambian con el tiempo', () => {
    for (const status of ['ACCEPTED', 'REJECTED', 'EXPIRED', 'AMBIGUOUS', 'CANCELLED'] as const) {
      expect(effectiveStatus(row(status, null), at(3_600_000))).toBe(status);
    }
  });
});
