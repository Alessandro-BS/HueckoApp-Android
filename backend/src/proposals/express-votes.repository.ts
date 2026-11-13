import { randomUUID } from 'node:crypto';

import type { ExpressOption, ExpressVote } from '@hueckoapp/shared';

import type { Db } from '../db/db';
import { isUniqueViolation } from '../db/errors';
import { EXPRESS_OPTIONS, quorumFor } from './express-rules';

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

export function expressVotesRepository(db: Db) {
  return {
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
  };
}
