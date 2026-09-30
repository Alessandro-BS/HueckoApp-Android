import type { AdminGroupDetail, AdminGroupSummary, AdminProposalSummary, Page, ProposalState } from '@hueckoapp/shared';

import type { Db, SqlParam } from '../db/db';
import { groupsRepository, MEMBER_ORDER } from '../groups/groups.repository';
import { ApiError } from '../middleware/errors';
import { proposalsRepository } from '../proposals/proposals.repository';
import { canCancel } from '../proposals/rules';
import type { AdminActor } from './admin-users';
import { auditRepository } from './audit.repository';
import { ADMIN_PAGE_SIZE, likePattern, offsetOf, toPage } from './paging';

type GroupRow = {
  id: string;
  name: string;
  description: string;
  created_at: string;
  member_count: number;
  proposal_count: number;
  owner_id: string | null;
  owner_name: string | null;
  owner_email: string | null;
};

type ProposalRow = {
  id: string;
  group_id: string;
  title: string;
  state: ProposalState;
  created_at: string;
  voting_deadline: string;
  scheduled_at: string | null;
  scheduled_date: string | null;
  creator_id: string;
  creator_name: string;
  creator_email: string;
  vote_count: number;
  incidence_count: number;
};

// El OWNER actual (si por datos rotos hubiera dos, el que llegó antes).
const GROUP_SELECT = `
  SELECT g.id, g.name, g.description, g.created_at,
         (SELECT COUNT(*) FROM group_members m WHERE m.group_id = g.id) AS member_count,
         (SELECT COUNT(*) FROM proposals p WHERE p.group_id = g.id) AS proposal_count,
         o.id AS owner_id, o.name AS owner_name, o.email AS owner_email
  FROM groups g
  LEFT JOIN users o ON o.id = (
    SELECT m.user_id FROM group_members m WHERE m.group_id = g.id AND m.role = 'OWNER' ${MEMBER_ORDER} LIMIT 1
  )`;

// voteCount solo cuenta a quienes siguen en el grupo, igual que GET /proposals/:id.
const PROPOSAL_SELECT = `
  SELECT p.id, p.group_id, p.title, p.state, p.created_at, p.voting_deadline, p.scheduled_at, p.scheduled_date,
         u.id AS creator_id, u.name AS creator_name, u.email AS creator_email,
         (SELECT COUNT(*) FROM votes v JOIN group_members m ON m.group_id = p.group_id AND m.user_id = v.user_id
          WHERE v.proposal_id = p.id) AS vote_count,
         (SELECT COUNT(*) FROM incidences i WHERE i.proposal_id = p.id) AS incidence_count
  FROM proposals p JOIN users u ON u.id = p.created_by`;

const toGroup = (r: GroupRow): AdminGroupSummary => ({
  id: r.id,
  name: r.name,
  description: r.description,
  memberCount: r.member_count,
  proposalCount: r.proposal_count,
  owner: r.owner_id === null ? null : { id: r.owner_id, name: r.owner_name ?? '', email: r.owner_email ?? '' },
  createdAt: r.created_at,
});

const toProposal = (r: ProposalRow): AdminProposalSummary => ({
  id: r.id,
  title: r.title,
  state: r.state,
  createdBy: { id: r.creator_id, name: r.creator_name, email: r.creator_email },
  createdAt: r.created_at,
  votingDeadline: r.voting_deadline,
  scheduledAt: r.scheduled_at,
  scheduledDate: r.scheduled_date,
  voteCount: r.vote_count,
  incidenceCount: r.incidence_count,
});

const groupNotFound = () => new ApiError(404, 'GROUP_NOT_FOUND', 'Grupo no encontrado.');
const proposalNotFound = () => new ApiError(404, 'PROPOSAL_NOT_FOUND', 'Propuesta no encontrada.');

export function adminGroups(db: Db) {
  const audit = auditRepository(db);
  const groups = groupsRepository(db);
  const proposals = proposalsRepository(db);

  const loadGroup = async (id: string): Promise<GroupRow> => {
    const row = await db.one<GroupRow>(`${GROUP_SELECT} WHERE g.id = $1`, [id]);
    if (!row) throw groupNotFound();
    return row;
  };
  const findProposal = (id: string) => db.one<ProposalRow>(`${PROPOSAL_SELECT} WHERE p.id = $1`, [id]);

  return {
    async list(search: string, page: number): Promise<Page<AdminGroupSummary>> {
      const filter: SqlParam[] = search ? [likePattern(search)] : [];
      const where = search ? `WHERE g.name LIKE $1 ESCAPE '\\' OR g.invite_code LIKE $1 ESCAPE '\\'` : '';
      const { total } = (await db.one<{ total: number }>(`SELECT COUNT(*) AS total FROM groups g ${where}`, filter))!;
      const n = filter.length;
      const rows = await db.many<GroupRow>(
        `${GROUP_SELECT} ${where} ORDER BY g.created_at DESC, g.rowid DESC LIMIT $${n + 1} OFFSET $${n + 2}`,
        [...filter, ADMIN_PAGE_SIZE, offsetOf(page)],
      );
      return toPage(rows.map(toGroup), page, total);
    },

    async detail(id: string): Promise<AdminGroupDetail> {
      const row = await loadGroup(id);
      const group = await groups.findById(id);
      if (!group) throw groupNotFound();
      const rows = await db.many<ProposalRow>(`${PROPOSAL_SELECT} WHERE p.group_id = $1 ORDER BY p.created_at DESC, p.rowid DESC`, [id]);
      return {
        ...toGroup(row),
        inviteCode: group.inviteCode,
        availabilityThreshold: group.availabilityThreshold,
        members: group.members,
        proposals: rows.map(toProposal),
      };
    },

    // Borra el grupo con todo lo suyo: miembros, propuestas, franjas, votos e incidencias caen por ON DELETE CASCADE.
    remove(actor: AdminActor, id: string): Promise<void> {
      return db.transaction(async () => {
        const row = await loadGroup(id);
        await db.query('DELETE FROM groups WHERE id = $1', [id]);
        await audit.record({
          adminId: actor.adminId,
          action: 'GROUP_DELETED',
          targetType: 'GROUP',
          targetId: id,
          details: { name: row.name, members: row.member_count, proposals: row.proposal_count },
          createdAt: actor.now.toISOString(),
        });
      });
    },

    // Moderación (D7): cualquier propuesta que no esté cancelada, sea de quien sea y sin ser miembro.
    cancelProposal(actor: AdminActor, id: string, reason: string): Promise<AdminProposalSummary> {
      return db.transaction(async () => {
        const row = await findProposal(id);
        if (!row) throw proposalNotFound();
        if (!canCancel(row.state)) throw new ApiError(409, 'INVALID_STATE', 'La propuesta ya está cancelada.');
        await proposals.setState(id, 'CANCELADO');
        await audit.record({
          adminId: actor.adminId,
          action: 'PROPOSAL_CANCELLED',
          targetType: 'PROPOSAL',
          targetId: id,
          details: { title: row.title, groupId: row.group_id, from: row.state, reason },
          createdAt: actor.now.toISOString(),
        });
        return toProposal((await findProposal(id))!);
      });
    },
  };
}
