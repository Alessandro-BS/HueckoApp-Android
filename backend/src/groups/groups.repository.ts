import { randomUUID } from 'node:crypto';

import type { Group, GroupMember, GroupSummary } from '@hueckoapp/shared';

import type { Db } from '../db/db';
import { generateInviteCode } from './invite-code';

type GroupRow = { id: string; name: string; description: string; invite_code: string; availability_threshold: number };
type SummaryRow = Omit<GroupRow, 'invite_code'> & { member_count: number };
type MemberRow = { id: string; name: string; email: string; role: GroupMember['role']; is_essential: number };

export type NewGroup = { name: string; description: string; availabilityThreshold: number; createdAt: string };

const toMember = (row: MemberRow): GroupMember => ({
  id: row.id,
  name: row.name,
  email: row.email,
  role: row.role,
  isEssential: row.is_essential === 1,
});

const MAX_CODE_ATTEMPTS = 5;

// Los miembros siempre en orden de llegada (joined_at y, si empatan, orden de inserción).
export const MEMBER_ORDER = 'ORDER BY m.joined_at, m.rowid';

export function groupsRepository(db: Db, generateCode: () => string = generateInviteCode) {
  const membersOf = async (groupId: string): Promise<GroupMember[]> => {
    const rows = await db.many<MemberRow>(
      `SELECT u.id, u.name, u.email, m.role, m.is_essential
       FROM group_members m JOIN users u ON u.id = m.user_id
       WHERE m.group_id = $1 ${MEMBER_ORDER}`,
      [groupId],
    );
    return rows.map(toMember);
  };

  const findById = async (groupId: string): Promise<Group | undefined> => {
    const row = await db.one<GroupRow>('SELECT id, name, description, invite_code, availability_threshold FROM groups WHERE id = $1', [groupId]);
    if (!row) return undefined;
    const members = await membersOf(groupId);
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

  // Guarda el grupo si nadie tiene ya ese código; false si lo tiene otro. ON CONFLICT no lanza error (no aborta la
  // transacción) y dos creaciones a la vez nunca comparten código (D12).
  const insertIfCodeFree = async (id: string, code: string, input: NewGroup): Promise<boolean> => {
    const { rowCount } = await db.query(
      `INSERT INTO groups (id, name, description, invite_code, availability_threshold, created_at)
       VALUES ($1, $2, $3, $4, $5, $6) ON CONFLICT (invite_code) DO NOTHING`,
      [id, input.name, input.description, code, input.availabilityThreshold, input.createdAt],
    );
    return rowCount > 0;
  };

  return {
    findById,

    async listForUser(userId: string): Promise<GroupSummary[]> {
      const rows = await db.many<SummaryRow>(
        `SELECT g.id, g.name, g.description, g.availability_threshold,
                (SELECT COUNT(*) FROM group_members c WHERE c.group_id = g.id) AS member_count
         FROM group_members m JOIN groups g ON g.id = m.group_id
         WHERE m.user_id = $1 ${MEMBER_ORDER}`,
        [userId],
      );
      return rows.map((r) => ({
        id: r.id,
        name: r.name,
        description: r.description,
        memberCount: r.member_count,
        availabilityThreshold: r.availability_threshold,
      }));
    },

    async findIdByInviteCode(code: string): Promise<string | undefined> {
      return (await db.one<{ id: string }>('SELECT id FROM groups WHERE invite_code = $1', [code]))?.id;
    },

    // Código único (G11): si el generado ya existe, se prueba otro, hasta MAX_CODE_ATTEMPTS códigos.
    // `createdAt` sale del reloj de la app, como el resto de fechas que cuentan las estadísticas.
    async create(ownerId: string, input: NewGroup): Promise<Group> {
      const id = randomUUID();
      await db.transaction(async () => {
        for (let attempt = 1; !(await insertIfCodeFree(id, generateCode(), input)); attempt++) {
          if (attempt >= MAX_CODE_ATTEMPTS) throw new Error('No se pudo generar un código de invitación único');
        }
        await db.query("INSERT INTO group_members (group_id, user_id, role) VALUES ($1, $2, 'OWNER')", [id, ownerId]);
      });
      return (await findById(id))!;
    },

    // Unirse. false si ya era miembro: dos peticiones a la vez no chocan con la clave primaria (D12).
    async addMember(groupId: string, userId: string): Promise<boolean> {
      const { rowCount } = await db.query(
        "INSERT INTO group_members (group_id, user_id, role) VALUES ($1, $2, 'MEMBER') ON CONFLICT (group_id, user_id) DO NOTHING",
        [groupId, userId],
      );
      return rowCount > 0;
    },

    async update(groupId: string, patch: { name?: string; description?: string; availabilityThreshold?: number }): Promise<void> {
      await db.query(
        `UPDATE groups SET
           name = COALESCE($1, name),
           description = COALESCE($2, description),
           availability_threshold = COALESCE($3, availability_threshold)
         WHERE id = $4`,
        [patch.name ?? null, patch.description ?? null, patch.availabilityThreshold ?? null, groupId],
      );
    },

    async setEssential(groupId: string, userId: string, isEssential: boolean): Promise<void> {
      await db.query('UPDATE group_members SET is_essential = $1 WHERE group_id = $2 AND user_id = $3', [isEssential, groupId, userId]);
    },

    // Salir del grupo. Si no queda nadie, el grupo se borra; si se fue el último OWNER,
    // pasa a serlo quien lleva más tiempo (domain spec C6).
    leave(groupId: string, userId: string): Promise<void> {
      return db.transaction(async () => {
        await db.query('DELETE FROM group_members WHERE group_id = $1 AND user_id = $2', [groupId, userId]);
        const { remaining, owners } = (await db.one<{ remaining: number; owners: number }>(
          `SELECT COUNT(*) AS remaining, COUNT(*) FILTER (WHERE role = 'OWNER') AS owners
           FROM group_members WHERE group_id = $1`,
          [groupId],
        ))!;
        if (remaining === 0) {
          await db.query('DELETE FROM groups WHERE id = $1', [groupId]);
        } else if (owners === 0) {
          await db.query(
            `UPDATE group_members SET role = 'OWNER'
             WHERE group_id = $1 AND user_id = (
               SELECT user_id FROM group_members WHERE group_id = $1 ORDER BY joined_at, rowid LIMIT 1
             )`,
            [groupId],
          );
        }
      });
    },
  };
}
