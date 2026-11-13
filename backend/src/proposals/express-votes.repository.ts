import { randomUUID } from 'node:crypto';

import type { ExpressOption, ExpressVote, ProposalState } from '@hueckoapp/shared';

import type { Db } from '../db/db';
import { isUniqueViolation } from '../db/errors';
import { EXPRESS_OPTIONS, quorumFor, tally } from './express-rules';

type VoteRow = {
  id: string;
  proposal_id: string;
  reporter_id: string;
  reporter_name: string;
  reporter_email: string;
  reason: string;
  critical_reason: string;
  status: ExpressVote['status'];
  opened_at: string;
  expires_at: string;
  closed_at: string | null;
  result: ExpressOption | null;
  result_by_default: boolean | null;
  recommendation: ExpressOption | null;
  recommendation_reason: string | null;
};
// Un votante fijado al abrir; `present` es true si todavía es miembro del grupo del plan.
type VoterRow = { vote_id: string; user_id: string; option: ExpressOption | null; present: boolean };

export type OpenExpressVote = {
  proposalId: string;
  reporterId: string;
  reason: string;
  criticalReason: string;
  voterIds: readonly string[];
  openedAt: string;
  expiresAt: string;
};

// Dónde buscar votaciones vencidas que cerrar antes de una lista: los planes de un grupo o los de mis grupos. (Un
// solo plan se cierra con closeDue, después de comprobar el acceso.)
export type CloseScope = { groupId: string } | { userId: string };

export const SCOPE_FILTER = {
  groupId: 'p.group_id = $1',
  userId: 'p.group_id IN (SELECT group_id FROM group_members WHERE user_id = $1)',
} as const;

// Lo que el resultado hace con el plan, solo si sigue CONFIRMADO (si alguien lo canceló, no se toca). Cancelar deja
// auto_closed en false: «CANCELADO con auto_closed» significa solo «nadie votó antes del plazo» (y se puede replantear).
async function applyResult(db: Db, proposalId: string, result: ExpressOption): Promise<void> {
  if (result === 'CANCELAR') {
    await db.query("UPDATE proposals SET state = 'CANCELADO', auto_closed = FALSE WHERE id = $1 AND state = 'CONFIRMADO'", [proposalId]);
  } else if (result === 'REAGENDAR') {
    // Recoordinación: sin franja elegida ni fecha, y sin los votos de fecha (quien gestiona propone franjas nuevas).
    await db.query(
      `UPDATE proposals SET state = 'EN_RECOORDINACION', chosen_window_id = NULL, scheduled_at = NULL, scheduled_date = NULL
       WHERE id = $1 AND state = 'CONFIRMADO'`,
      [proposalId],
    );
    await db.query('DELETE FROM votes WHERE proposal_id = $1', [proposalId]);
  }
}

export function expressVotesRepository(db: Db) {
  const repo = {
    /** Abre la votación con sus votantes fijados. `null` si el plan ya tiene una ABIERTA (índice único parcial). */
    async open(i: OpenExpressVote): Promise<string | null> {
      const id = randomUUID();
      try {
        await db.transaction(async () => {
          await db.query(
            `INSERT INTO express_votes (id, proposal_id, reporter_id, reason, critical_reason, status, opened_at, expires_at)
             VALUES ($1, $2, $3, $4, $5, 'ABIERTA', $6, $7)`,
            [id, i.proposalId, i.reporterId, i.reason, i.criticalReason, i.openedAt, i.expiresAt],
          );
          for (const userId of i.voterIds) {
            await db.query('INSERT INTO express_vote_voters (vote_id, user_id) VALUES ($1, $2)', [id, userId]);
          }
        });
      } catch (e) {
        if (isUniqueViolation(e, 'express_votes_one_open')) return null;
        throw e;
      }
      return id;
    },

    /** Registra (o cambia) el voto de un votante fijado. No comprueba estado ni plazo: lo hace quien llama. */
    async castVote(voteId: string, userId: string, option: ExpressOption, at: string): Promise<void> {
      await db.query('UPDATE express_vote_voters SET option = $3, voted_at = $4 WHERE vote_id = $1 AND user_id = $2', [voteId, userId, option, at]);
    },

    async findOpen(proposalId: string): Promise<{ id: string; expiresAt: string } | undefined> {
      const row = await db.one<{ id: string; expires_at: string }>("SELECT id, expires_at FROM express_votes WHERE proposal_id = $1 AND status = 'ABIERTA'", [proposalId]);
      return row ? { id: row.id, expiresAt: row.expires_at } : undefined;
    },

    /**
     * La votación más reciente de cada plan. Cuentan solo los votantes que SIGUEN en el grupo del plan (se mira
     * group_members al leer): sus votos, `eligibleVoters`, `quorum` y `canVote`. Con `proposalIds` vacío no consulta.
     * (Los miembros actuales salen de un JOIN en SQL, no de un callback: el repositorio no depende de quien llama.)
     */
    async latestFor(proposalIds: readonly string[], viewerId: string): Promise<Map<string, ExpressVote>> {
      const result = new Map<string, ExpressVote>();
      if (proposalIds.length === 0) return result;
      const votes = await db.many<VoteRow>(
        `SELECT DISTINCT ON (v.proposal_id) v.*, u.name AS reporter_name, u.email AS reporter_email
         FROM express_votes v JOIN users u ON u.id = v.reporter_id
         WHERE v.proposal_id = ANY($1::text[])
         ORDER BY v.proposal_id, v.opened_at DESC, v.seq DESC`,
        [proposalIds],
      );
      if (votes.length === 0) return result;
      const voters = await db.many<VoterRow>(
        `SELECT vv.vote_id, vv.user_id, vv.option, (m.user_id IS NOT NULL) AS present
         FROM express_vote_voters vv
         JOIN express_votes v ON v.id = vv.vote_id
         JOIN proposals p ON p.id = v.proposal_id
         LEFT JOIN group_members m ON m.group_id = p.group_id AND m.user_id = vv.user_id
         WHERE vv.vote_id = ANY($1::text[])`,
        [votes.map((v) => v.id)],
      );
      for (const v of votes) {
        const present = voters.filter((r) => r.vote_id === v.id && r.present);
        const counts = Object.fromEntries(EXPRESS_OPTIONS.map((o) => [o, present.filter((r) => r.option === o).length])) as Record<ExpressOption, number>;
        const mine = present.find((r) => r.user_id === viewerId);
        result.set(v.proposal_id, {
          id: v.id,
          status: v.status,
          reportedBy: { id: v.reporter_id, name: v.reporter_name, email: v.reporter_email },
          reason: v.reason,
          criticalReason: v.critical_reason,
          openedAt: v.opened_at,
          expiresAt: v.expires_at,
          closedAt: v.closed_at,
          counts,
          myVote: mine?.option ?? null,
          canVote: v.status === 'ABIERTA' && mine !== undefined,
          eligibleVoters: present.length,
          quorum: quorumFor(present.length),
          result: v.result,
          resultByDefault: v.result_by_default,
          recommendation: v.recommendation !== null && v.recommendation_reason !== null ? { option: v.recommendation, reason: v.recommendation_reason } : null,
        });
      }
      return result;
    },

    /** Guarda la recomendación de la IA solo si la votación sigue ABIERTA. false si ya cerró. */
    async saveRecommendation(voteId: string, option: ExpressOption, reason: string): Promise<boolean> {
      const r = await db.query("UPDATE express_votes SET recommendation = $2, recommendation_reason = $3 WHERE id = $1 AND status = 'ABIERTA'", [voteId, option, reason]);
      return r.rowCount > 0;
    },

    /** Borra las votaciones CERRADAS del plan (se usa al replantearlo); la ABIERTA, si hay, se queda. */
    async deleteClosedFor(proposalId: string): Promise<void> {
      await db.query("DELETE FROM express_votes WHERE proposal_id = $1 AND status = 'CERRADA'", [proposalId]);
    },

    /**
     * Guarda (o cambia) el voto solo si el plan sigue CONFIRMADO y la votación sigue ABIERTA y sin vencer, con el plan y
     * la votación bloqueados (en ese orden, como closeDue): un cierre o una cancelación a la vez esperan al voto, o el
     * voto los ve ya aplicados. false si ya cerró o si quien gestiona canceló el plan con la votación abierta (votar ya
     * no decide nada). Quién puede votar lo comprueba quien llama.
     */
    castVoteIfOpen(voteId: string, userId: string, option: ExpressOption, now: Date): Promise<boolean> {
      return db.transaction(async () => {
        const plan = await db.one<{ state: ProposalState }>(
          'SELECT state FROM proposals WHERE id = (SELECT proposal_id FROM express_votes WHERE id = $1) FOR UPDATE',
          [voteId],
        );
        if (plan?.state !== 'CONFIRMADO') return false;
        const open = await db.one(
          "SELECT id FROM express_votes WHERE id = $1 AND status = 'ABIERTA' AND expires_at > $2 FOR UPDATE",
          [voteId, now.toISOString()],
        );
        if (!open) return false;
        await repo.castVote(voteId, userId, option, now.toISOString());
        return true;
      });
    },

    /**
     * Cierra la votación ABIERTA del plan si venció o si ya votaron todos los votantes que siguen en el grupo: hace el
     * recuento, la marca CERRADA, aplica el resultado (solo si el plan sigue CONFIRMADO) y deja resueltas todas las
     * incidencias del plan. Todo o nada, con el plan y la votación bloqueados (en ese orden, como reportar); el UPDATE
     * de cierre exige que siga ABIERTA, así que dos cierres a la vez aplican el resultado una sola vez. true si cerró.
     */
    closeDue(proposalId: string, now: Date): Promise<boolean> {
      return db.transaction(async () => {
        const plan = await db.one<{ state: ProposalState; group_id: string }>('SELECT state, group_id FROM proposals WHERE id = $1 FOR UPDATE', [proposalId]);
        if (!plan) return false;
        const vote = await db.one<{ id: string; expires_at: string }>(
          "SELECT id, expires_at FROM express_votes WHERE proposal_id = $1 AND status = 'ABIERTA' FOR UPDATE",
          [proposalId],
        );
        if (!vote) return false;
        // Solo cuentan los votantes fijados que siguen en el grupo.
        const voters = await db.many<{ option: ExpressOption | null }>(
          `SELECT vv.option FROM express_vote_voters vv
           JOIN group_members m ON m.group_id = $2 AND m.user_id = vv.user_id
           WHERE vv.vote_id = $1`,
          [vote.id, plan.group_id],
        );
        const expired = new Date(vote.expires_at).getTime() <= now.getTime();
        if (!expired && voters.some((v) => v.option === null)) return false;
        const { result, byDefault } = tally(voters.flatMap((v) => (v.option === null ? [] : [v.option])), voters.length);
        const { rowCount } = await db.query(
          "UPDATE express_votes SET status = 'CERRADA', closed_at = $2, result = $3, result_by_default = $4 WHERE id = $1 AND status = 'ABIERTA'",
          [vote.id, now.toISOString(), result, byDefault],
        );
        if (rowCount === 0) return false;
        if (plan.state === 'CONFIRMADO') await applyResult(db, proposalId, result);
        await db.query('UPDATE incidences SET resolved = TRUE WHERE proposal_id = $1', [proposalId]);
        return true;
      });
    },

    /**
     * Cierre perezoso antes de una lectura: `closeDue` de cada votación ABIERTA y **vencida** del alcance (sin ninguna,
     * una sola consulta y nada más). Nunca lanza: un error se anota en el log y la lectura sigue (la siguiente lo reintenta).
     */
    async closeDueInScope(scope: CloseScope, now: Date): Promise<void> {
      const [filter, value] = 'groupId' in scope ? [SCOPE_FILTER.groupId, scope.groupId] : [SCOPE_FILTER.userId, scope.userId];
      try {
        const due = await db.many<{ proposal_id: string }>(
          `SELECT v.proposal_id FROM express_votes v JOIN proposals p ON p.id = v.proposal_id
           WHERE ${filter} AND v.status = 'ABIERTA' AND v.expires_at <= $2`,
          [value, now.toISOString()],
        );
        for (const { proposal_id } of due) {
          try {
            await repo.closeDue(proposal_id, now);
          } catch (error) {
            logCloseError(proposal_id, error);
          }
        }
      } catch (error) {
        logCloseError(null, error);
      }
    },
  };
  return repo;
}

/** Un cierre que falla no corta la petición: se anota (salvo en los tests) y lo reintenta la siguiente lectura. */
export function logCloseError(proposalId: string | null, error: unknown): void {
  if (process.env.NODE_ENV === 'test') return;
  console.error(`No se pudo cerrar la votación exprés${proposalId ? ` del plan ${proposalId}` : ''}:`, error instanceof Error ? error.message : error);
}
