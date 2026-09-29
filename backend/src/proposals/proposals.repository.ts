import { randomUUID } from 'node:crypto';

import type { Criticality, Incidence, IncidenceType, Location, Proposal, ProposalState, ProposalWithGroup, TimeWindow } from '@hueckoapp/shared';

import type { Db } from '../db/database';
import { withTransaction } from '../db/transaction';

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
type WindowRow = { id: string; day_of_week: number; start_time: string; end_time: string; availability_percentage: number; vote_count: number };
type IncidenceRow = {
  id: string;
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

export function proposalsRepository(db: Db) {
  const windowsOf = (proposalId: string): TimeWindow[] =>
    (
      db
        .prepare(
          `SELECT w.id, w.day_of_week, w.start_time, w.end_time, w.availability_percentage,
                  (SELECT COUNT(*) FROM votes v WHERE v.window_id = w.id) AS vote_count
           FROM proposal_windows w WHERE w.proposal_id = ?
           ORDER BY w.day_of_week, w.start_time, w.end_time`,
        )
        .all(proposalId) as WindowRow[]
    ).map((r) => ({
      id: r.id,
      dayOfWeek: r.day_of_week,
      startTime: r.start_time,
      endTime: r.end_time,
      availabilityPercentage: r.availability_percentage,
      voteCount: r.vote_count,
    }));

  const incidencesOf = (proposalId: string): Incidence[] =>
    (
      db
        .prepare(
          `SELECT i.*, u.name AS user_name, u.email AS user_email
           FROM incidences i JOIN users u ON u.id = i.user_id
           WHERE i.proposal_id = ? ORDER BY i.created_at, i.rowid`,
        )
        .all(proposalId) as IncidenceRow[]
    ).map((r) => ({
      id: r.id,
      user: { id: r.user_id, name: r.user_name, email: r.user_email },
      type: r.type,
      reason: r.reason,
      delayMinutes: r.delay_minutes,
      criticality: r.criticality,
      resolved: r.resolved === 1,
      createdAt: r.created_at,
    }));

  const myVote = (proposalId: string, viewerId: string): string | null => {
    const row = db.prepare('SELECT window_id FROM votes WHERE proposal_id = ? AND user_id = ?').get(proposalId, viewerId) as
      | { window_id: string }
      | undefined;
    return row?.window_id ?? null;
  };

  // `viewerId` decide myVoteWindowId: la misma propuesta se ve distinta según quién pregunta.
  const toProposal = (row: ProposalRow, viewerId: string): Proposal => ({
    id: row.id,
    groupId: row.group_id,
    title: row.title,
    location: row.location_name === null ? null : { name: row.location_name, latitude: row.latitude, longitude: row.longitude },
    createdBy: { id: row.created_by, name: row.creator_name, email: row.creator_email },
    votingDeadline: row.voting_deadline,
    state: row.state,
    windows: windowsOf(row.id),
    myVoteWindowId: myVote(row.id, viewerId),
    chosenWindowId: row.chosen_window_id,
    scheduledAt: row.scheduled_at,
    scheduledDate: row.scheduled_date,
    incidences: incidencesOf(row.id),
    createdAt: row.created_at,
  });

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
      return row && toProposal(row, viewerId);
    },

    // Las más recientes primero (C10); a igual createdAt, la última insertada.
    listByGroup(groupId: string, viewerId: string): Proposal[] {
      const rows = db.prepare(`${SELECT_PROPOSAL} WHERE p.group_id = ? ORDER BY p.created_at DESC, p.rowid DESC`).all(groupId) as ProposalRow[];
      return rows.map((r) => toProposal(r, viewerId));
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

    // Todas las propuestas de mis grupos, de la más antigua a la más reciente (Inicio y /me/upcoming-plans).
    listForUser(userId: string): ProposalWithGroup[] {
      const rows = db
        .prepare(`${SELECT_PROPOSAL} JOIN group_members m ON m.group_id = p.group_id AND m.user_id = ? ORDER BY p.created_at, p.rowid`)
        .all(userId) as ProposalRow[];
      return rows.map((r) => ({ ...toProposal(r, userId), groupName: r.group_name }));
    },
  };
}
