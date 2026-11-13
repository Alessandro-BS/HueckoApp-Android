import { randomUUID } from 'node:crypto';

import type { Criticality, GroupMember, Incidence, IncidenceType, Location, Proposal, ProposalState, ProposalWithGroup, TimeWindow } from '@hueckoapp/shared';

import { isoDay } from '../common/zone';
import type { Db } from '../db/db';
import { MEMBER_ORDER } from '../groups/groups.repository';
import { expiresAtFor } from './express-rules';
import { expressVotesRepository } from './express-votes.repository';
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
  date: string;
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
  resolved: boolean;
  critical_reason: string | null;
  created_at: string;
};
type MyVoteRow = { proposal_id: string; window_id: string };
type MemberRow = { group_id: string; id: string; role: GroupMember['role'] };

// `date` es "YYYY-MM-DD" (en America/Lima) y ya validada por quien llama: el día de la semana se deriva de ella.
export type NewWindow = { date: string; startTime: string; endTime: string; availabilityPercentage: number };
export type NewIncidence = {
  userId: string;
  type: IncidenceType;
  reason: string;
  delayMinutes: number | null;
  criticality: Criticality;
  // Por qué es crítica (abre la votación exprés); null si no lo es.
  criticalReason: string | null;
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
  // ISO del reloj de la app: se escribe siempre explícito, nunca el valor por defecto de la tabla.
  createdAt: string;
};

// Una fila de proposals con el nombre del grupo y los datos de quien la creó.

const SELECT_PROPOSAL = `
  SELECT p.*, g.name AS group_name, u.name AS creator_name, u.email AS creator_email
  FROM proposals p
  JOIN groups g ON g.id = p.group_id
  JOIN users u ON u.id = p.created_by`;

// Los ids de las propuestas van en UN parámetro (el número `param`): la misma sentencia sirve para 1 o para 500
// propuestas. Uso: `WHERE x.proposal_id ${inProposalIds(1)}`.
const inProposalIds = (param: number) => `= ANY($${param}::text[])`;

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
  date: r.date,
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
  resolved: r.resolved,
  criticalReason: r.critical_reason,
  createdAt: r.created_at,
});

export function proposalsRepository(db: Db) {
  /**
   * Completa las filas con sus franjas (y votos), incidencias y el voto de `viewerId` con un número FIJO de consultas,
   * sin importar cuántas propuestas haya (antes eran 3 por propuesta: N+1). `viewerId` decide myVoteWindowId:
   * la misma propuesta se ve distinta según quién pregunta. Mismo orden y mismas claves que antes.
   */
  const hydrate = async (rows: readonly ProposalRow[], viewerId: string): Promise<Proposal[]> => {
    if (rows.length === 0) return [];
    const ids = rows.map((r) => r.id);
    // voteCount solo cuenta a quienes SIGUEN en el grupo de la propuesta (D5): el voto de quien sale no se borra,
    // pero no suma; si vuelve a unirse, cuenta otra vez. De aquí salen pickWinner, Inicio y el resumen con IA.
    const windows = groupBy(
      await db.many<WindowRow>(
        `SELECT w.id, w.proposal_id, w.date, w.day_of_week, w.start_time, w.end_time, w.availability_percentage,
                COUNT(m.user_id) AS vote_count
         FROM proposal_windows w
         JOIN proposals p ON p.id = w.proposal_id
         LEFT JOIN votes v ON v.window_id = w.id
         LEFT JOIN group_members m ON m.group_id = p.group_id AND m.user_id = v.user_id
         WHERE w.proposal_id ${inProposalIds(1)}
         GROUP BY w.id
         ORDER BY w.date, w.start_time, w.end_time`,
        [ids],
      ),
      (r) => r.proposal_id,
      toWindow,
    );
    const incidences = groupBy(
      await db.many<IncidenceRow>(
        `SELECT i.*, u.name AS user_name, u.email AS user_email
         FROM incidences i JOIN users u ON u.id = i.user_id
         WHERE i.proposal_id ${inProposalIds(1)}
         ORDER BY i.created_at, i.seq`,
        [ids],
      ),
      (r) => r.proposal_id,
      toIncidence,
    );
    const myVotes = new Map(
      (await db.many<MyVoteRow>(`SELECT proposal_id, window_id FROM votes WHERE user_id = $1 AND proposal_id ${inProposalIds(2)}`, [viewerId, ids])).map(
        (r) => [r.proposal_id, r.window_id] as const,
      ),
    );
    // Miembros actuales de los grupos de estas propuestas, en orden de llegada (D3): deciden canManage.
    const members = groupBy(
      await db.many<MemberRow>(
        `SELECT m.group_id, m.user_id AS id, m.role
         FROM group_members m
         WHERE m.group_id IN (SELECT p.group_id FROM proposals p WHERE p.id ${inProposalIds(1)})
         ${MEMBER_ORDER}`,
        [ids],
      ),
      (r) => r.group_id,
      (r): ManagerCandidate => ({ id: r.id, role: r.role }),
    );
    const expressVotes = await expressVotesRepository(db).latestFor(ids, viewerId);
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
      expressVote: expressVotes.get(row.id) ?? null,
      createdAt: row.created_at,
    }));
  };

  // proposal_windows no tiene created_at: se ordenan por fecha y hora, no por creación.
  // day_of_week se guarda siempre derivado de la fecha (lo siguen leyendo el cruce de horarios y la app).
  const insertWindow = async (proposalId: string, w: NewWindow): Promise<string> => {
    const id = randomUUID();
    await db.query(
      'INSERT INTO proposal_windows (id, proposal_id, date, day_of_week, start_time, end_time, availability_percentage) VALUES ($1, $2, $3, $4, $5, $6, $7)',
      [id, proposalId, w.date, isoDay(w.date), w.startTime, w.endTime, w.availabilityPercentage],
    );
    return id;
  };

  return {
    async findById(id: string, viewerId: string): Promise<Proposal | undefined> {
      const row = await db.one<ProposalRow>(`${SELECT_PROPOSAL} WHERE p.id = $1`, [id]);
      return row ? (await hydrate([row], viewerId))[0] : undefined;
    },

    // Las más recientes primero (C10); a igual createdAt, la última insertada.
    async listByGroup(groupId: string, viewerId: string): Promise<Proposal[]> {
      const rows = await db.many<ProposalRow>(`${SELECT_PROPOSAL} WHERE p.group_id = $1 ORDER BY p.created_at DESC, p.seq DESC`, [groupId]);
      return hydrate(rows, viewerId);
    },

    // La propuesta y sus franjas, todo o nada.
    async create(input: NewProposal): Promise<string> {
      const id = randomUUID();
      await db.transaction(async () => {
        await db.query(
          `INSERT INTO proposals (id, group_id, title, location_name, latitude, longitude, created_by, voting_deadline, created_at)
           VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)`,
          [
            id, input.groupId, input.title, input.location?.name ?? null, input.location?.latitude ?? null,
            input.location?.longitude ?? null, input.createdBy, input.votingDeadline, input.createdAt,
          ],
        );
        for (const w of input.windows) await insertWindow(id, w);
      });
      return id;
    },

    addWindow: insertWindow,

    // Reprogramar y replantear: las franjas nuevas reemplazan a las anteriores, todo o nada. Primero se borran los
    // votos (apuntan a las franjas viejas por id) y después las franjas; la confirmación se limpia porque su franja
    // elegida ya no existe. El estado lo decide quien llama.
    async replaceWindows(proposalId: string, windows: NewWindow[], votingDeadline: string): Promise<void> {
      await db.transaction(async () => {
        await db.query('DELETE FROM votes WHERE proposal_id = $1', [proposalId]);
        await db.query('DELETE FROM proposal_windows WHERE proposal_id = $1', [proposalId]);
        for (const w of windows) await insertWindow(proposalId, w);
        await db.query(
          'UPDATE proposals SET chosen_window_id = NULL, scheduled_at = NULL, scheduled_date = NULL, voting_deadline = $1 WHERE id = $2',
          [votingDeadline, proposalId],
        );
      });
    },

    // Replantear: igual que replaceWindows, pero solo si la propuesta sigue en PROPUESTO (false si otra petición la
    // confirmó o canceló mientras tanto; entonces no se toca nada).
    async replanWindows(proposalId: string, windows: NewWindow[], votingDeadline: string): Promise<boolean> {
      return db.transaction(async () => {
        const { rowCount } = await db.query(
          "UPDATE proposals SET voting_deadline = $1 WHERE id = $2 AND state = 'PROPUESTO'",
          [votingDeadline, proposalId],
        );
        if (rowCount === 0) return false;
        await this.replaceWindows(proposalId, windows, votingDeadline);
        return true;
      });
    },

    // Un voto por persona y propuesta: votar otra franja lo mueve; la misma, no cambia nada (G1).
    // `createdAt` (ISO del reloj de la app) se escribe explícito; al mover el voto se actualiza también.
    async vote(proposalId: string, userId: string, windowId: string, createdAt: string): Promise<void> {
      await db.query(
        `INSERT INTO votes (proposal_id, user_id, window_id, created_at) VALUES ($1, $2, $3, $4)
         ON CONFLICT (proposal_id, user_id) DO UPDATE
           SET window_id = excluded.window_id,
               created_at = CASE WHEN votes.window_id = excluded.window_id THEN votes.created_at ELSE excluded.created_at END`,
        [proposalId, userId, windowId, createdAt],
      );
    },

    async unvote(proposalId: string, userId: string): Promise<void> {
      await db.query('DELETE FROM votes WHERE proposal_id = $1 AND user_id = $2', [proposalId, userId]);
    },

    // Los cambios de estado solo se aplican si el plan sigue en el estado que la ruta comprobó: false si otra petición
    // lo cambió mientras tanto (p. ej. un admin lo canceló), y la ruta responde 409 en vez de pisarlo o resucitarlo.
    // Confirmar, además, bloquea el plan y comprueba que la franja elegida sigue en él: un replanteo que llegó entre la
    // lectura de la ruta y aquí ya la borró (con READ COMMITTED, un EXISTS dentro del UPDATE no lo vería). Si el
    // replanteo llega después, espera al candado y ve el plan ya CONFIRMADO.
    confirm(id: string, windowId: string, scheduledAt: string, scheduledDate: string): Promise<boolean> {
      return db.transaction(async () => {
        const row = await db.one<{ state: ProposalState }>('SELECT id, state FROM proposals WHERE id = $1 FOR UPDATE', [id]);
        if (!row || row.state !== 'PROPUESTO') return false;
        const window = await db.one('SELECT id FROM proposal_windows WHERE id = $1 AND proposal_id = $2', [windowId, id]);
        if (!window) return false;
        const { rowCount } = await db.query(
          `UPDATE proposals SET state = 'CONFIRMADO', chosen_window_id = $1, scheduled_at = $2, scheduled_date = $3
           WHERE id = $4 AND state = 'PROPUESTO'`,
          [windowId, scheduledAt, scheduledDate, id],
        );
        return rowCount > 0;
      });
    },

    async cancel(id: string): Promise<boolean> {
      const { rowCount } = await db.query("UPDATE proposals SET state = 'CANCELADO' WHERE id = $1 AND state <> 'CANCELADO'", [id]);
      return rowCount > 0;
    },

    /**
     * Guarda la incidencia y, si es crítica (`criticalReason`), abre la votación exprés del grupo: todo o nada, con el
     * plan bloqueado. Solo sobre un plan CONFIRMADO (según el estado bloqueado); `saved: false`, sin guardar nada, si
     * otra petición lo canceló o lo mandó a recoordinar mientras tanto. No abre otra si ya hay una ABIERTA (la
     * incidencia se guarda igual) ni si nadie más del grupo puede votar. `openedVoteId`: la votación que abrió, si abrió.
     */
    reportIncidence(proposalId: string, input: NewIncidence, expressVoteMinutes: number): Promise<{ saved: boolean; openedVoteId: string | null }> {
      return db.transaction(async () => {
        // Bloquea el plan hasta el final: una cancelación o un cierre de votación a la vez espera a que la incidencia
        // (y su votación) quede guardada; si llegó antes, aquí se ve el plan ya cambiado y no se guarda nada. También
        // ordena dos reportes a la vez: el segundo ve la votación que abrió el primero.
        const row = await db.one<{ state: ProposalState; scheduled_at: string | null; group_id: string }>(
          'SELECT state, scheduled_at, group_id FROM proposals WHERE id = $1 FOR UPDATE',
          [proposalId],
        );
        if (!row || row.state !== 'CONFIRMADO') return { saved: false, openedVoteId: null };
        await db.query(
          `INSERT INTO incidences (id, proposal_id, user_id, type, reason, delay_minutes, criticality, critical_reason, created_at)
           VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)`,
          [randomUUID(), proposalId, input.userId, input.type, input.reason, input.delayMinutes, input.criticality, input.criticalReason, input.createdAt],
        );
        if (input.criticalReason === null) return { saved: true, openedVoteId: null };
        const votes = expressVotesRepository(db);
        // Con el plan bloqueado nadie más abre una a la vez: se comprueba antes en vez de dejar que salte el índice
        // único (un error de la base dentro de esta transacción la desharía entera).
        if (await votes.findOpen(proposalId)) return { saved: true, openedVoteId: null };
        // Votan los miembros de ahora menos quien avisa; si no queda nadie, solo se informa.
        const voterIds = (
          await db.many<{ user_id: string }>('SELECT user_id FROM group_members WHERE group_id = $1 AND user_id <> $2', [row.group_id, input.userId])
        ).map((r) => r.user_id);
        if (voterIds.length === 0) return { saved: true, openedVoteId: null };
        const openedVoteId = await votes.open({
          proposalId,
          reporterId: input.userId,
          reason: input.reason,
          criticalReason: input.criticalReason,
          voterIds,
          openedAt: input.createdAt,
          // scheduled_at del plan CONFIRMADO bloqueado (siempre lo tiene; null solo si faltara: entonces no se acota).
          expiresAt: expiresAtFor(new Date(input.createdAt), row.scheduled_at, expressVoteMinutes),
        });
        return { saved: true, openedVoteId };
      });
    },

    // Todas las propuestas de mis grupos, de la más antigua a la más reciente (orden de inserción si empatan):
    // Inicio y /me/upcoming-plans.
    async listForUser(userId: string): Promise<ProposalWithGroup[]> {
      const rows = await db.many<ProposalRow>(
        `${SELECT_PROPOSAL} JOIN group_members m ON m.group_id = p.group_id AND m.user_id = $1 ORDER BY p.created_at, p.seq`,
        [userId],
      );
      const groupNames = new Map(rows.map((r) => [r.id, r.group_name] as const));
      return (await hydrate(rows, userId)).map((p) => ({ ...p, groupName: groupNames.get(p.id)! }));
    },
  };
}
