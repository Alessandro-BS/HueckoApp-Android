import type { Db } from '../db/db';
import { CODE_TTL_MINUTES, type ChallengePurpose } from './challenge-rules';

export type ChallengeRow = {
  id: string;
  userId: string;
  email: string;
  purpose: ChallengePurpose;
  codeHash: string;
  attempts: number;
  sendCount: number;
  createdAt: string;
  expiresAt: string;
  lastSentAt: string | null;
  consumedAt: string | null;
};

export type NewChallenge = { id: string; userId: string; purpose: ChallengePurpose; codeHash: string; createdAt: string; expiresAt: string };

type DbRow = {
  id: string;
  user_id: string;
  email: string;
  purpose: ChallengePurpose;
  code_hash: string;
  attempts: number;
  send_count: number;
  created_at: string;
  expires_at: string;
  last_sent_at: string | null;
  consumed_at: string | null;
};

const toRow = (r: DbRow): ChallengeRow => ({
  id: r.id,
  userId: r.user_id,
  email: r.email,
  purpose: r.purpose,
  codeHash: r.code_hash,
  attempts: r.attempts,
  sendCount: r.send_count,
  createdAt: r.created_at,
  expiresAt: r.expires_at,
  lastSentAt: r.last_sent_at,
  consumedAt: r.consumed_at,
});

const SELECT = 'SELECT c.*, u.email FROM auth_challenges c JOIN users u ON u.id = c.user_id';
const addMinutes = (iso: string, minutes: number) => new Date(new Date(iso).getTime() + minutes * 60_000).toISOString();

// Solo SQL: qué reglas aplican a cada reto lo decide challenges.ts.
export function challengesRepository(db: Db) {
  return {
    async insert(row: NewChallenge): Promise<void> {
      await db.query('INSERT INTO auth_challenges (id, user_id, purpose, code_hash, created_at, expires_at) VALUES ($1, $2, $3, $4, $5, $6)', [
        row.id, row.userId, row.purpose, row.codeHash, row.createdAt, row.expiresAt,
      ]);
    },

    /** El reto sin consumir del usuario para ese propósito (a lo sumo uno: auth_challenges_one_live). */
    async liveFor(userId: string, purpose: ChallengePurpose): Promise<ChallengeRow | undefined> {
      const r = await db.one<DbRow>(`${SELECT} WHERE c.user_id = $1 AND c.purpose = $2 AND c.consumed_at IS NULL`, [userId, purpose]);
      return r && toRow(r);
    },

    /** Bloquea la fila hasta el final de la transacción: los intentos simultáneos hacen cola en vez de contar por separado. */
    /** De quién es el reto, sin candado: para bloquear la cuenta antes que el reto. */
    async ownerOf(id: string): Promise<string | undefined> {
      return (await db.one<{ user_id: string }>('SELECT user_id FROM auth_challenges WHERE id = $1', [id]))?.user_id;
    },

    async findForUpdate(id: string): Promise<ChallengeRow | undefined> {
      const r = await db.one<DbRow>(`${SELECT} WHERE c.id = $1 FOR UPDATE OF c`, [id]);
      return r && toRow(r);
    },

    /** Serializa a quienes piden un reto para la misma cuenta (primera consulta de su transacción). */
    async lockUser(userId: string): Promise<void> {
      await db.query('SELECT id FROM users WHERE id = $1 FOR UPDATE', [userId]);
    },

    /** Deshace el envío anotado de un reto cuyo correo no salió. */
    async markUnsent(id: string): Promise<void> {
      await db.query('UPDATE auth_challenges SET send_count = 0, last_sent_at = NULL WHERE id = $1', [id]);
    },

    async consume(id: string, now: string): Promise<void> {
      await db.query('UPDATE auth_challenges SET consumed_at = $2 WHERE id = $1 AND consumed_at IS NULL', [id, now]);
    },

    async consumeLive(userId: string, purpose: ChallengePurpose, now: string): Promise<void> {
      await db.query('UPDATE auth_challenges SET consumed_at = $3 WHERE user_id = $1 AND purpose = $2 AND consumed_at IS NULL', [userId, purpose, now]);
    },

    async recordFailure(id: string): Promise<void> {
      await db.query('UPDATE auth_challenges SET attempts = attempts + 1 WHERE id = $1', [id]);
    },

    async recordSend(id: string, now: string): Promise<void> {
      await db.query('UPDATE auth_challenges SET send_count = send_count + 1, last_sent_at = $2 WHERE id = $1', [id, now]);
    },

    /** Código nuevo: el anterior deja de valer, los intentos vuelven a 0 y el vencimiento corre desde `now`. */
    async refreshCode(id: string, codeHash: string, now: string): Promise<void> {
      await db.query('UPDATE auth_challenges SET code_hash = $2, attempts = 0, expires_at = $3 WHERE id = $1', [id, codeHash, addMinutes(now, CODE_TTL_MINUTES)]);
    },

    /** Correos enviados a ese usuario desde `sinceIso` (suma de send_count de sus retos creados desde entonces). */
    async emailsSentSince(userId: string, sinceIso: string): Promise<number> {
      const r = await db.one<{ n: number }>('SELECT COALESCE(SUM(send_count), 0)::int AS n FROM auth_challenges WHERE user_id = $1 AND created_at >= $2', [userId, sinceIso]);
      return r?.n ?? 0;
    },
  };
}
