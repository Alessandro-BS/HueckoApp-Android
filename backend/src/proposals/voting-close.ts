import type { ProposalState } from '@hueckoapp/shared';

import type { Db } from '../db/db';
import { type CloseScope, expressVotesRepository, logCloseError, SCOPE_FILTER } from './express-votes.repository';
import { windowsWithVotes } from './proposals.repository';
import { pickWinner, scheduleFor } from './rules';

// Cierre automático de la votación de franjas (fase 4, regla 1). Sin procesos en segundo plano: una propuesta PROPUESTO
// con el plazo vencido se cierra al consultarla (como la votación exprés), con su fila bloqueada, así que dos lecturas a
// la vez la cierran una sola vez. El resultado no depende de cuándo se mire: tras el plazo ya no entran votos
// (voteIfOpen comprueba el plazo con la misma fila bloqueada).

/** Dónde buscar propuestas vencidas: un grupo, los grupos de un usuario o todas (estadísticas del admin). */
export type ProposalCloseScope = CloseScope | { all: true };

/**
 * Cierra la votación de la propuesta si sigue PROPUESTO y su plazo venció: CONFIRMADO con la franja ganadora (la misma
 * regla que «confirmar» sin windowId, contando solo los votos de quienes siguen en el grupo) o CANCELADO si nadie votó.
 * Se confirma aunque la franja ya haya empezado: al vencer el plazo era válida. true si la cerró.
 */
export function closeProposalIfDue(db: Db, proposalId: string, now: Date): Promise<boolean> {
  return db.transaction(async () => {
    const row = await db.one<{ state: ProposalState; voting_deadline: string; group_id: string }>(
      'SELECT state, voting_deadline, group_id FROM proposals WHERE id = $1 FOR UPDATE',
      [proposalId],
    );
    if (!row || row.state !== 'PROPUESTO' || new Date(row.voting_deadline).getTime() > now.getTime()) return false;
    // El mismo recuento que ve la app (windowsWithVotes): solo suman los votos de quienes siguen en el grupo.
    const winner = pickWinner((await windowsWithVotes(db, [proposalId])).get(proposalId) ?? []);
    if (winner) {
      const { scheduledAt, scheduledDate } = scheduleFor(winner.date, winner.startTime);
      const { rowCount } = await db.query(
        `UPDATE proposals SET state = 'CONFIRMADO', chosen_window_id = $2, scheduled_at = $3, scheduled_date = $4, auto_closed = TRUE
         WHERE id = $1 AND state = 'PROPUESTO'`,
        [proposalId, winner.id, scheduledAt, scheduledDate],
      );
      return rowCount > 0;
    }
    const { rowCount } = await db.query("UPDATE proposals SET state = 'CANCELADO', auto_closed = TRUE WHERE id = $1 AND state = 'PROPUESTO'", [proposalId]);
    return rowCount > 0;
  });
}

/**
 * Cierre perezoso antes de una lectura: closeProposalIfDue de cada propuesta PROPUESTO vencida del alcance (sin ninguna,
 * una sola consulta). Nunca lanza: cada propuesta se cierra en su propio intento y un error se anota en el log (la
 * siguiente lectura lo reintenta).
 */
export async function closeDueProposals(db: Db, scope: ProposalCloseScope, now: Date): Promise<void> {
  const [filter, params]: [string, string[]] =
    'all' in scope
      ? ['TRUE', []]
      : 'groupId' in scope
        ? [SCOPE_FILTER.groupId, [scope.groupId]]
        : [SCOPE_FILTER.userId, [scope.userId]];
  try {
    const due = await db.many<{ id: string }>(
      `SELECT p.id FROM proposals p WHERE ${filter} AND p.state = 'PROPUESTO' AND p.voting_deadline <= $${params.length + 1}`,
      [...params, now.toISOString()],
    );
    for (const { id } of due) {
      try {
        await closeProposalIfDue(db, id, now);
      } catch (error) {
        logCloseError(id, error, VOTING);
      }
    }
  } catch (error) {
    logCloseError(null, error, VOTING);
  }
}

/**
 * Antes de que alguien entre o salga del grupo (salir, unirse con el código, aceptar por proximidad): cierra sus
 * votaciones vencidas, de franjas y exprés, con los miembros de ese momento. Si no, el resultado de un cierre perezoso
 * dependería de quién entró o salió después del plazo. Nunca lanza. Va fuera de cualquier transacción: cada cierre abre
 * la suya.
 */
export async function closeDueBeforeMembershipChange(db: Db, groupId: string, now: Date): Promise<void> {
  await closeDueProposals(db, { groupId }, now);
  await expressVotesRepository(db).closeDueInScope({ groupId }, now);
}

/** Para logCloseError: qué votación no se pudo cerrar. */
export const VOTING = 'la votación de franjas';
