import { randomUUID } from 'node:crypto';

import type { Group, GroupMember, GroupSummary } from '@hueckoapp/shared';

import type { Db } from '../db/database';
import { withTransaction } from '../db/transaction';
import { generateInviteCode } from './invite-code';

type GroupRow = { id: string; name: string; description: string; invite_code: string; availability_threshold: number };
type SummaryRow = Omit<GroupRow, 'invite_code'> & { member_count: number };
type MemberRow = { id: string; name: string; email: string; role: GroupMember['role']; is_essential: number };

const toMember = (row: MemberRow): GroupMember => ({
  id: row.id,
  name: row.name,
  email: row.email,
  role: row.role,
  isEssential: row.is_essential === 1,
});

const MAX_CODE_ATTEMPTS = 5;

// Los miembros siempre en orden de llegada (joined_at y, si empatan, orden de inserción).
const MEMBER_ORDER = 'ORDER BY m.joined_at, m.rowid';

export function groupsRepository(db: Db, generateCode: () => string = generateInviteCode) {
  const membersOf = (groupId: string): GroupMember[] =>
    (
      db
        .prepare(
          `SELECT u.id, u.name, u.email, m.role, m.is_essential
           FROM group_members m JOIN users u ON u.id = m.user_id
           WHERE m.group_id = ? ${MEMBER_ORDER}`,
        )
        .all(groupId) as MemberRow[]
    ).map(toMember);

  const findById = (groupId: string): Group | undefined => {
    const row = db
      .prepare('SELECT id, name, description, invite_code, availability_threshold FROM groups WHERE id = ?')
      .get(groupId) as GroupRow | undefined;
    if (!row) return undefined;
    const members = membersOf(groupId);
    return {
      id: row.id,
      name: row.name,
      description: row.description,
      availabilityThreshold: row.availability_threshold,
      memberCount: members.length,
      inviteCode: row.invite_code,
      members,
    };
  };

  const codeExists = (code: string) => db.prepare('SELECT 1 FROM groups WHERE invite_code = ?').get(code) !== undefined;

  return {
    findById,

    listForUser(userId: string): GroupSummary[] {
      const rows = db
        .prepare(
          `SELECT g.id, g.name, g.description, g.availability_threshold,
                  (SELECT COUNT(*) FROM group_members c WHERE c.group_id = g.id) AS member_count
           FROM group_members m JOIN groups g ON g.id = m.group_id
           WHERE m.user_id = ? ${MEMBER_ORDER}`,
        )
        .all(userId) as SummaryRow[];
      return rows.map((r) => ({
        id: r.id,
        name: r.name,
        description: r.description,
        memberCount: r.member_count,
        availabilityThreshold: r.availability_threshold,
      }));
    },

    findIdByInviteCode(code: string): string | undefined {
      const row = db.prepare('SELECT id FROM groups WHERE invite_code = ?').get(code) as { id: string } | undefined;
      return row?.id;
    },

    isMember(groupId: string, userId: string): boolean {
      return db.prepare('SELECT 1 FROM group_members WHERE group_id = ? AND user_id = ?').get(groupId, userId) !== undefined;
    },

    // Código único: se reintenta si ya existe (G11). node:sqlite es síncrono, así que entre la
    // comprobación y el INSERT no puede colarse otra petición.
    create(ownerId: string, input: { name: string; description: string; availabilityThreshold: number }): Group {
      let code = generateCode();
      for (let attempt = 1; codeExists(code); attempt++) {
        if (attempt >= MAX_CODE_ATTEMPTS) throw new Error('No se pudo generar un código de invitación único');
        code = generateCode();
      }
      const id = randomUUID();
      withTransaction(db, () => {
        db.prepare('INSERT INTO groups (id, name, description, invite_code, availability_threshold) VALUES (?, ?, ?, ?, ?)').run(
          id, input.name, input.description, code, input.availabilityThreshold,
        );
        db.prepare("INSERT INTO group_members (group_id, user_id, role) VALUES (?, ?, 'OWNER')").run(id, ownerId);
      });
      return findById(id)!;
    },

    addMember(groupId: string, userId: string): void {
      db.prepare("INSERT INTO group_members (group_id, user_id, role) VALUES (?, ?, 'MEMBER')").run(groupId, userId);
    },

    update(groupId: string, patch: { name?: string; description?: string; availabilityThreshold?: number }): void {
      db.prepare(
        `UPDATE groups SET
           name = COALESCE(?, name),
           description = COALESCE(?, description),
           availability_threshold = COALESCE(?, availability_threshold)
         WHERE id = ?`,
      ).run(patch.name ?? null, patch.description ?? null, patch.availabilityThreshold ?? null, groupId);
    },

    setEssential(groupId: string, userId: string, isEssential: boolean): void {
      db.prepare('UPDATE group_members SET is_essential = ? WHERE group_id = ? AND user_id = ?').run(
        isEssential ? 1 : 0, groupId, userId,
      );
    },

    // Salir del grupo. Si no queda nadie, el grupo se borra; si se fue el último OWNER,
    // pasa a serlo quien lleva más tiempo (domain spec C6).
    leave(groupId: string, userId: string): void {
      withTransaction(db, () => {
        db.prepare('DELETE FROM group_members WHERE group_id = ? AND user_id = ?').run(groupId, userId);
        const { remaining, owners } = db
          .prepare(
            `SELECT COUNT(*) AS remaining, COALESCE(SUM(role = 'OWNER'), 0) AS owners
             FROM group_members WHERE group_id = ?`,
          )
          .get(groupId) as { remaining: number; owners: number };
        if (remaining === 0) {
          db.prepare('DELETE FROM groups WHERE id = ?').run(groupId);
        } else if (owners === 0) {
          db.prepare(
            `UPDATE group_members SET role = 'OWNER'
             WHERE group_id = ? AND user_id = (
               SELECT user_id FROM group_members WHERE group_id = ? ORDER BY joined_at, rowid LIMIT 1
             )`,
          ).run(groupId, groupId);
        }
      });
    },
  };
}
