import type { AdminUserActivity, AdminUserDetail, AdminUserGroup, AdminUserSummary, Page, UserRole, UserStatus } from '@hueckoapp/shared';

import type { Db } from '../db/database';
import { withTransaction } from '../db/transaction';
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

export function adminUsers(db: Db) {
  const audit = auditRepository(db);

  const load = (id: string): SummaryRow => {
    const row = db.prepare(`${SUMMARY_SELECT} WHERE u.id = ?`).get(id) as SummaryRow | undefined;
    if (!row) throw userNotFound();
    return row;
  };

  const activeAdmins = () =>
    (db.prepare("SELECT COUNT(*) AS n FROM users WHERE role = 'ADMIN' AND status = 'ACTIVE'").get() as { n: number }).n;

  const assertNotSelf = (actor: AdminActor, targetId: string) => {
    if (actor.adminId === targetId) {
      throw new ApiError(409, 'CANNOT_CHANGE_SELF', 'No puedes suspender tu propia cuenta ni quitarte el rol de administrador.');
    }
  };

  // Quien deja de ser administrador activo (suspendido o sin rol) no puede ser el último (D4).
  const assertNotLastAdmin = (target: SummaryRow) => {
    if (target.role === 'ADMIN' && target.status === 'ACTIVE' && activeAdmins() <= 1) {
      throw new ApiError(409, 'LAST_ADMIN', 'Tiene que quedar al menos un administrador activo.');
    }
  };

  const summary = (id: string): AdminUserSummary => toSummary(load(id));

  return {
    list(search: string, page: number): Page<AdminUserSummary> {
      const where = search ? `WHERE u.name LIKE ? ESCAPE '\\' OR u.email LIKE ? ESCAPE '\\'` : '';
      const params = search ? [likePattern(search), likePattern(search)] : [];
      const { total } = db.prepare(`SELECT COUNT(*) AS total FROM users u ${where}`).get(...params) as { total: number };
      const rows = db
        .prepare(`${SUMMARY_SELECT} ${where} ORDER BY u.created_at DESC, u.rowid DESC LIMIT ? OFFSET ?`)
        .all(...params, ADMIN_PAGE_SIZE, offsetOf(page)) as SummaryRow[];
      return toPage(rows.map(toSummary), page, total);
    },

    summary,

    detail(id: string): AdminUserDetail {
      const base = summary(id);
      const groups = (
        db
          .prepare(`SELECT g.id, g.name, m.role FROM group_members m JOIN groups g ON g.id = m.group_id WHERE m.user_id = ? ${MEMBER_ORDER}`)
          .all(id) as AdminUserGroup[]
      ).map((g) => ({ id: g.id, name: g.name, role: g.role }));
      const a = db
        .prepare(
          `SELECT (SELECT COUNT(*) FROM proposals WHERE created_by = ?) AS proposals_created,
                  (SELECT COUNT(*) FROM votes WHERE user_id = ?) AS votes,
                  (SELECT COUNT(*) FROM incidences WHERE user_id = ?) AS incidences,
                  (SELECT COUNT(*) FROM time_blocks WHERE user_id = ?) AS time_blocks,
                  (SELECT COUNT(*) FROM ai_calls WHERE user_id = ?) AS ai_calls`,
        )
        .get(id, id, id, id, id) as ActivityRow;
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
    setStatus(actor: AdminActor, id: string, status: UserStatus): boolean {
      return withTransaction(db, () => {
        const target = load(id);
        if (target.status === status) return false;
        assertNotSelf(actor, id);
        if (status === 'SUSPENDED') assertNotLastAdmin(target);
        db.prepare('UPDATE users SET status = ? WHERE id = ?').run(status, id);
        audit.record({
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
    setRole(actor: AdminActor, id: string, role: UserRole): boolean {
      return withTransaction(db, () => {
        const target = load(id);
        if (target.role === role) return false;
        assertNotSelf(actor, id);
        if (role === 'USER') assertNotLastAdmin(target);
        db.prepare('UPDATE users SET role = ? WHERE id = ?').run(role, id);
        audit.record({
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
export function setRoleByEmail(db: Db, email: string, role: UserRole, now: Date): { user: AdminUserSummary; changed: boolean } {
  const row = db.prepare('SELECT id FROM users WHERE email = ?').get(email) as { id: string } | undefined;
  if (!row) throw new ApiError(404, 'USER_NOT_FOUND', `No hay ninguna cuenta con el correo «${email}».`);
  const users = adminUsers(db);
  const changed = users.setRole({ adminId: null, now }, row.id, role);
  return { user: users.summary(row.id), changed };
}
