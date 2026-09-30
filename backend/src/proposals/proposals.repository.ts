import { randomUUID } from 'node:crypto';

import type { Criticality, GroupMember, Incidence, IncidenceType, Location, Proposal, ProposalState, ProposalWithGroup, TimeWindow } from '@hueckoapp/shared';

import type { Db } from '../db/database';
import { withTransaction } from '../db/transaction';
import { canManageProposal, type ManagerCandidate } from './permissions';

type ProposalRow = {
  id: string;
  group_id: string;
  group_name: string;
  title: string;
  location_name: string | null;
  latitude: number | null;
  longitude: number | null;
  created_by: string;
  creator_name: string;
  creator_email: string;
  voting_deadline: string;
  state: ProposalState;
  chosen_window_id: string | null;
  scheduled_at: string | null;
  scheduled_date: string | null;
  created_at: string;
};
type WindowRow = {
  id: string;
  proposal_id: string;
  day_of_week: number;
  start_time: string;
  end_time: string;
  availability_percentage: number;
  vote_count: number;
};
type IncidenceRow = {
  id: string;
  proposal_id: string;
  user_id: string;
  user_name: string;
  user_email: string;
  type: IncidenceType;
  reason: string;
  delay_minutes: number | null;
  criticality: Criticality;
  resolved: number;
  created_at: string;
};
type MyVoteRow = { proposal_id: string; window_id: string };
type MemberRow = { group_id: string; id: string; role: GroupMember['role'] };

export type NewWindow = { dayOfWeek: number; startTime: string; endTime: string; availabilityPercentage: number };
export type NewIncidence = {
  userId: string;
  type: IncidenceType;
  reason: string;
  delayMinutes: number | null;
  criticality: Criticality;
  // ISO del reloj de la app, explícito como en las demás tablas.
  createdAt: string;
};
export type NewProposal = {
  groupId: string;
  createdBy: string;
  title: string;
  location: Location | null;
  votingDeadline: string;
  windows: NewWindow[];
  // ISO del reloj de la app: se escribe siempre explícito, nunca el valor por defecto de SQLite.
  createdAt: string;
};

// Una fila de proposals con el nombre del grupo y los datos de quien la creó.
const SELECT_PROPOSAL = `
  SELECT p.*, g.name AS group_name, u.name AS creator_name, u.email AS creator_email
  FROM proposals p
  JOIN groups g ON g.id = p.group_id
  JOIN users u ON u.id = p.created_by`;

// Los ids de las propuestas van en UN parámetro JSON (json_each): la misma sentencia sirve para 1 o para 500
// propuestas y no choca con el límite de parámetros de SQLite. Uso: `WHERE x.proposal_id ${IN_PROPOSAL_IDS}`.
const IN_PROPOSAL_IDS = 'IN (SELECT value FROM json_each(?))';

/** Agrupa filas por clave conservando su orden (el ORDER BY de la consulta). */
function groupBy<R, T>(rows: readonly R[], keyOf: (row: R) => string, map: (row: R) => T): Map<string, T[]> {
  const out = new Map<string, T[]>();
  for (const row of rows) {
    const key = keyOf(row);
    const list = out.get(key);
    if (list) list.push(map(row));
    else out.set(key, [map(row)]);
  }
  return out;
}

const toWindow = (r: WindowRow): TimeWindow => ({
  id: r.id,
  dayOfWeek: r.day_of_week,
  startTime: r.start_time,
  endTime: r.end_time,
  availabilityPercentage: r.availability_percentage,
  voteCount: r.vote_count,
});

const toIncidence = (r: IncidenceRow): Incidence => ({
  id: r.id,
  user: { id: r.user_id, name: r.user_name, email: r.user_email },
  type: r.type,
  reason: r.reason,
  delayMinutes: r.delay_minutes,
  criticality: r.criticality,
  resolved: r.resolved === 1,
  createdAt: r.created_at,
});

export function proposalsRepository(db: Db) {
  /**
   * Completa las filas con sus franjas (y votos), incidencias y el voto de `viewerId` con un número FIJO de consultas,
   * sin importar cuántas propuestas haya (antes eran 3 por propuesta: N+1). `viewerId` decide myVoteWindowId:
   * la misma propuesta se ve distinta según quién pregunta. Mismo orden y mismas claves que antes.
   */
  const hydrate = (rows: readonly ProposalRow[], viewerId: string): Proposal[] => {
    if (rows.length === 0) return [];
    const ids = JSON.stringify(rows.map((r) => r.id));
    // voteCount solo cuenta a quienes SIGUEN en el grupo de la propuesta (D5): el voto de quien sale no se borra,
    // pero no suma; si vuelve a unirse, cuenta otra vez. De aquí salen pickWinner, Inicio y el resumen con IA.
    const windows = groupBy(
      db
        .prepare(
          `SELECT w.id, w.proposal_id, w.day_of_week, w.start_time, w.end_time, w.availability_percentage,
                  COUNT(m.user_id) AS vote_count
           FROM proposal_windows w
           JOIN proposals p ON p.id = w.proposal_id
           LEFT JOIN votes v ON v.window_id = w.id
           LEFT JOIN group_members m ON m.group_id = p.group_id AND m.user_id = v.user_id
           WHERE w.proposal_id ${IN_PROPOSAL_IDS}
           GROUP BY w.id
           ORDER BY w.day_of_week, w.start_time, w.end_time`,
        )
        .all(ids) as WindowRow[],
      (r) => r.proposal_id,
      toWindow,
    );
    const incidences = groupBy(
      db
        .prepare(
          `SELECT i.*, u.name AS user_name, u.email AS user_email
           FROM incidences i JOIN users u ON u.id = i.user_id
           WHERE i.proposal_id ${IN_PROPOSAL_IDS}
           ORDER BY i.created_at, i.rowid`,
        )
        .all(ids) as IncidenceRow[],
      (r) => r.proposal_id,
      toIncidence,
    );
    const myVotes = new Map(
      (db.prepare(`SELECT proposal_id, window_id FROM votes WHERE user_id = ? AND proposal_id ${IN_PROPOSAL_IDS}`).all(viewerId, ids) as MyVoteRow[]).map(
        (r) => [r.proposal_id, r.window_id] as const,
      ),
    );
    // Miembros actuales de los grupos de estas propuestas, en orden de llegada (D3): deciden canManage.
    const members = groupBy(
      db
        .prepare(
          `SELECT m.group_id, m.user_id AS id, m.role
           FROM group_members m
           WHERE m.group_id IN (SELECT p.group_id FROM proposals p WHERE p.id ${IN_PROPOSAL_IDS})
           ORDER BY m.joined_at, m.rowid`,
        )
        .all(ids) as MemberRow[],
      (r) => r.group_id,
      (r): ManagerCandidate => ({ id: r.id, role: r.role }),
    );
    return rows.map((row) => ({
      id: row.id,
      groupId: row.group_id,
      title: row.title,
      location: row.location_name === null ? null : { name: row.location_name, latitude: row.latitude, longitude: row.longitude },
      createdBy: { id: row.created_by, name: row.creator_name, email: row.creator_email },
      votingDeadline: row.voting_deadline,
      state: row.state,
      windows: windows.get(row.id) ?? [],
      myVoteWindowId: myVotes.get(row.id) ?? null,
      canManage: canManageProposal({ viewerId, creatorId: row.created_by, members: members.get(row.group_id) ?? [] }),
      chosenWindowId: row.chosen_window_id,
      scheduledAt: row.scheduled_at,
      scheduledDate: row.scheduled_date,
      incidences: incidences.get(row.id) ?? [],
      createdAt: row.created_at,
    }));
  };

  // proposal_windows no tiene created_at: se ordenan por día y hora, no por creación.
  const insertWindow = (proposalId: string, w: NewWindow): string => {
    const id = randomUUID();
    db.prepare(
      'INSERT INTO proposal_windows (id, proposal_id, day_of_week, start_time, end_time, availability_percentage) VALUES (?, ?, ?, ?, ?, ?)',
    ).run(id, proposalId, w.dayOfWeek, w.startTime, w.endTime, w.availabilityPercentage);
    return id;
  };

  return {
    findById(id: string, viewerId: string): Proposal | undefined {
      const row = db.prepare(`${SELECT_PROPOSAL} WHERE p.id = ?`).get(id) as ProposalRow | undefined;
      return row ? hydrate([row], viewerId)[0] : undefined;
    },

    // Las más recientes primero (C10); a igual createdAt, la última insertada.
    listByGroup(groupId: string, viewerId: string): Proposal[] {
      const rows = db.prepare(`${SELECT_PROPOSAL} WHERE p.group_id = ? ORDER BY p.created_at DESC, p.rowid DESC`).all(groupId) as ProposalRow[];
      return hydrate(rows, viewerId);
    },

    // La propuesta y sus franjas, todo o nada.
    create(input: NewProposal): string {
      const id = randomUUID();
      withTransaction(db, () => {
        db.prepare(
          `INSERT INTO proposals (id, group_id, title, location_name, latitude, longitude, created_by, voting_deadline, created_at)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        ).run(
          id, input.groupId, input.title, input.location?.name ?? null, input.location?.latitude ?? null,
          input.location?.longitude ?? null, input.createdBy, input.votingDeadline, input.createdAt,
        );
        for (const w of input.windows) insertWindow(id, w);
      });
      return id;
    },

    addWindow: insertWindow,

    // Un voto por persona y propuesta: votar otra franja lo mueve; la misma, no cambia nada (G1).
    // `createdAt` (ISO del reloj de la app) se escribe explícito; al mover el voto se actualiza también.
    vote(proposalId: string, userId: string, windowId: string, createdAt: string): void {
      db.prepare(
        `INSERT INTO votes (proposal_id, user_id, window_id, created_at) VALUES (?, ?, ?, ?)
         ON CONFLICT (proposal_id, user_id) DO UPDATE
           SET window_id = excluded.window_id,
               created_at = CASE WHEN votes.window_id = excluded.window_id THEN votes.created_at ELSE excluded.created_at END`,
      ).run(proposalId, userId, windowId, createdAt);
    },

    unvote(proposalId: string, userId: string): void {
      db.prepare('DELETE FROM votes WHERE proposal_id = ? AND user_id = ?').run(proposalId, userId);
    },

    confirm(id: string, windowId: string, scheduledAt: string, scheduledDate: string): void {
      db.prepare(
        "UPDATE proposals SET state = 'CONFIRMADO', chosen_window_id = ?, scheduled_at = ?, scheduled_date = ? WHERE id = ?",
      ).run(windowId, scheduledAt, scheduledDate, id);
    },

    setState(id: string, state: ProposalState): void {
      db.prepare('UPDATE proposals SET state = ? WHERE id = ?').run(state, id);
    },

    // La incidencia y, si falta un imprescindible, el paso a EN_RECOORDINACION: todo o nada.
    reportIncidence(proposalId: string, input: NewIncidence, escalate: boolean): void {
      withTransaction(db, () => {
        db.prepare(
          `INSERT INTO incidences (id, proposal_id, user_id, type, reason, delay_minutes, criticality, created_at)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
        ).run(randomUUID(), proposalId, input.userId, input.type, input.reason, input.delayMinutes, input.criticality, input.createdAt);
        if (escalate) db.prepare("UPDATE proposals SET state = 'EN_RECOORDINACION' WHERE id = ?").run(proposalId);
      });
    },

    // Votación exprés (G4): todas las incidencias quedan resueltas; reprogramar abre una votación nueva.
    resolveIncidences(id: string, newState: 'CONFIRMADO' | 'CANCELADO' | 'PROPUESTO', votingDeadline: string | null): void {
      withTransaction(db, () => {
        db.prepare('UPDATE incidences SET resolved = 1 WHERE proposal_id = ?').run(id);
        if (newState === 'PROPUESTO') {
          db.prepare('DELETE FROM votes WHERE proposal_id = ?').run(id);
          db.prepare(
            "UPDATE proposals SET state = 'PROPUESTO', chosen_window_id = NULL, scheduled_at = NULL, scheduled_date = NULL, voting_deadline = ? WHERE id = ?",
          ).run(votingDeadline, id);
        } else {
          db.prepare('UPDATE proposals SET state = ? WHERE id = ?').run(newState, id);
        }
      });
    },

    // Todas las propuestas de mis grupos, de la más antigua a la más reciente (created_at, rowid): Inicio y /me/upcoming-plans.
    listForUser(userId: string): ProposalWithGroup[] {
      const rows = db
        .prepare(`${SELECT_PROPOSAL} JOIN group_members m ON m.group_id = p.group_id AND m.user_id = ? ORDER BY p.created_at, p.rowid`)
        .all(userId) as ProposalRow[];
      const groupNames = new Map(rows.map((r) => [r.id, r.group_name] as const));
      return hydrate(rows, userId).map((p) => ({ ...p, groupName: groupNames.get(p.id)! }));
    },
  };
}
