import type { AdminUserActivity, AdminUserDetail, AdminUserGroup, AdminUserSummary, Page, UserRole, UserStatus } from '@hueckoapp/shared';

import type { Db, SqlParam } from '../db/db';
import { MEMBER_ORDER } from '../groups/groups.repository';
import { ApiError } from '../middleware/errors';
import { auditRepository } from './audit.repository';
import { ADMIN_PAGE_SIZE, likePattern, offsetOf, toPage } from './paging';

// Quién hace el cambio: un admin (su id) o la consola del servidor (null), y con qué reloj (D3–D5).
export type AdminActor = { adminId: string | null; now: Date };

type SummaryRow = {
  id: string;
  name: string;
  email: string;
  role: UserRole;
  status: UserStatus;
  created_at: string;
  group_count: number;
};
type ActivityRow = { proposals_created: number; votes: number; incidences: number; time_blocks: number; ai_calls: number };

const SUMMARY_SELECT = `
  SELECT u.id, u.name, u.email, u.role, u.status, u.created_at,
         (SELECT COUNT(*) FROM group_members m WHERE m.user_id = u.id) AS group_count
  FROM users u`;

const toSummary = (r: SummaryRow): AdminUserSummary => ({
  id: r.id,
  name: r.name,
  email: r.email,
  role: r.role,
  status: r.status,
  createdAt: r.created_at,
  groupCount: r.group_count,
});

export const userNotFound = () => new ApiError(404, 'USER_NOT_FOUND', 'Usuario no encontrado.');

// Candado de los cambios de rol y estado: dos a la vez (dos admins, o un admin y la consola) se hacen uno tras otro,
// así la guarda LAST_ADMIN siempre cuenta con el resultado del otro y nunca quedan cero administradores activos.
const ADMIN_CHANGES_LOCK_ID = 72_616_002;

export function adminUsers(db: Db) {
  const audit = auditRepository(db);

  const load = async (id: string): Promise<SummaryRow> => {
    const row = await db.one<SummaryRow>(`${SUMMARY_SELECT} WHERE u.id = $1`, [id]);
    if (!row) throw userNotFound();
    return row;
  };

  const activeAdmins = async () =>
    (await db.one<{ n: number }>("SELECT COUNT(*) AS n FROM users WHERE role = 'ADMIN' AND status = 'ACTIVE'"))!.n;

  const assertNotSelf = (actor: AdminActor, targetId: string) => {
    if (actor.adminId === targetId) {
      throw new ApiError(409, 'CANNOT_CHANGE_SELF', 'No puedes suspender tu propia cuenta ni quitarte el rol de administrador.');
    }
  };

  // Quien deja de ser administrador activo (suspendido o sin rol) no puede ser el último (D4).
  const assertNotLastAdmin = async (target: SummaryRow) => {
    if (target.role === 'ADMIN' && target.status === 'ACTIVE' && (await activeAdmins()) <= 1) {
      throw new ApiError(409, 'LAST_ADMIN', 'Tiene que quedar al menos un administrador activo.');
    }
  };

  const summary = async (id: string): Promise<AdminUserSummary> => toSummary(await load(id));

  return {
    async list(search: string, page: number): Promise<Page<AdminUserSummary>> {
      const filter: SqlParam[] = search ? [likePattern(search)] : [];
      const where = search ? `WHERE u.name ILIKE $1 ESCAPE '\\' OR u.email ILIKE $1 ESCAPE '\\'` : '';
      const { total } = (await db.one<{ total: number }>(`SELECT COUNT(*) AS total FROM users u ${where}`, filter))!;
      const n = filter.length;
      const rows = await db.many<SummaryRow>(
        `${SUMMARY_SELECT} ${where} ORDER BY u.created_at DESC, u.seq DESC LIMIT $${n + 1} OFFSET $${n + 2}`,
        [...filter, ADMIN_PAGE_SIZE, offsetOf(page)],
      );
      return toPage(rows.map(toSummary), page, total);
    },

    summary,

    async detail(id: string): Promise<AdminUserDetail> {
      const base = await summary(id);
      const groups = await db.many<AdminUserGroup>(
        `SELECT g.id, g.name, m.role FROM group_members m JOIN groups g ON g.id = m.group_id WHERE m.user_id = $1 ${MEMBER_ORDER}`,
        [id],
      );
      const a = (await db.one<ActivityRow>(
        `SELECT (SELECT COUNT(*) FROM proposals WHERE created_by = $1) AS proposals_created,
                (SELECT COUNT(*) FROM votes WHERE user_id = $1) AS votes,
                (SELECT COUNT(*) FROM incidences WHERE user_id = $1) AS incidences,
                (SELECT COUNT(*) FROM time_blocks WHERE user_id = $1) AS time_blocks,
                (SELECT COUNT(*) FROM ai_calls WHERE user_id = $1) AS ai_calls`,
        [id],
      ))!;
      const activity: AdminUserActivity = {
        proposalsCreated: a.proposals_created,
        votes: a.votes,
        incidences: a.incidences,
        timeBlocks: a.time_blocks,
        aiCalls: a.ai_calls,
      };
      return { ...base, groups, activity };
    },

    /** Suspende o reactiva. `false` si ya estaba así (no se anota nada). */
    setStatus(actor: AdminActor, id: string, status: UserStatus): Promise<boolean> {
      return db.transaction(async () => {
        await db.query('SELECT pg_advisory_xact_lock($1)', [ADMIN_CHANGES_LOCK_ID]);
        const target = await load(id);
        if (target.status === status) return false;
        assertNotSelf(actor, id);
        if (status === 'SUSPENDED') await assertNotLastAdmin(target);
        await db.query('UPDATE users SET status = $1 WHERE id = $2', [status, id]);
        await audit.record({
          adminId: actor.adminId,
          action: status === 'SUSPENDED' ? 'USER_SUSPENDED' : 'USER_REACTIVATED',
          targetType: 'USER',
          targetId: id,
          details: { name: target.name, from: target.status, to: status },
          createdAt: actor.now.toISOString(),
        });
        return true;
      });
    },

    /** Da o quita el rol ADMIN. `false` si ya lo tenía así. */
    setRole(actor: AdminActor, id: string, role: UserRole): Promise<boolean> {
      return db.transaction(async () => {
        await db.query('SELECT pg_advisory_xact_lock($1)', [ADMIN_CHANGES_LOCK_ID]);
        const target = await load(id);
        if (target.role === role) return false;
        assertNotSelf(actor, id);
        if (role === 'USER') await assertNotLastAdmin(target);
        await db.query('UPDATE users SET role = $1 WHERE id = $2', [role, id]);
        await audit.record({
          adminId: actor.adminId,
          action: role === 'ADMIN' ? 'USER_PROMOTED' : 'USER_DEMOTED',
          targetType: 'USER',
          targetId: id,
          details: { name: target.name, from: target.role, to: role },
          createdAt: actor.now.toISOString(),
        });
        return true;
      });
    },
  };
}

/** Para la consola (npm run make-admin): da o quita el rol por correo, con las mismas guardas. */
export async function setRoleByEmail(db: Db, email: string, role: UserRole, now: Date): Promise<{ user: AdminUserSummary; changed: boolean }> {
  const row = await db.one<{ id: string }>('SELECT id FROM users WHERE email = $1', [email]);
  if (!row) throw new ApiError(404, 'USER_NOT_FOUND', `No hay ninguna cuenta con el correo «${email}».`);
  const users = adminUsers(db);
  const changed = await users.setRole({ adminId: null, now }, row.id, role);
  return { user: await users.summary(row.id), changed };
}
