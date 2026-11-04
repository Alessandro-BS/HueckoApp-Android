import { randomUUID } from 'node:crypto';

import type { ProximityRole, ProximityStatus } from '@hueckoapp/shared';

import type { Db } from '../db/db';
import { CONFIRM_TTL_MS, MATCH_WINDOW_MS, PROXIMITY_LOCK_ID, WAITING_TTL_MS } from './proximity-rules';

/** Un aviso (una mitad de la pareja), tal como está guardado. El estado vencido lo calcula effectiveStatus. */
export type ProximityRow = {
  id: string;
  user_id: string;
  role: ProximityRole;
  group_id: string | null;
  status: ProximityStatus;
  peer_id: string | null;
  created_at: string;
  matched_at: string | null;
};

const COLUMNS = 'p.id, p.user_id, p.role, p.group_id, p.status, p.peer_id, p.created_at, p.matched_at';

// Avisos de otro usuario con los que el aviso nuevo ($1 usuario, $2 rol, $3 grupo o null) podría formar pareja: del
// rol opuesto y sin que quien se une sea ya miembro del grupo de la invitación.
const COUNTERPARTS = `SELECT ${COLUMNS} FROM proximity_requests p
  WHERE p.user_id <> $1::text AND p.role <> $2::text
    AND NOT EXISTS (
      SELECT 1 FROM group_members m
      WHERE m.group_id = COALESCE(p.group_id, $3::text)
        AND m.user_id = CASE WHEN p.role = 'JOIN' THEN p.user_id ELSE $1::text END
    )`;

const before = (now: Date, ms: number) => new Date(now.getTime() - ms).toISOString();

export function proximityRepository(db: Db) {
  const findById = (id: string) => db.one<ProximityRow>(`SELECT ${COLUMNS} FROM proximity_requests p WHERE p.id = $1`, [id]);

  const setStatus = async (ids: string[], status: ProximityStatus) => {
    await db.query('UPDATE proximity_requests SET status = $1 WHERE id = ANY($2::text[])', [status, ids]);
  };

  // Las dos mitades de una pareja tienen siempre el mismo estado.
  const setPairStatus = (row: ProximityRow, status: ProximityStatus) =>
    setStatus(row.peer_id === null ? [row.id] : [row.id, row.peer_id], status);

  return {
    /**
     * Guarda un aviso nuevo y lo empareja (spec «Emparejamiento»). Bajo un candado fijo: dos avisos a la vez se
     * emparejan uno tras otro. `now` es el reloj del servidor, nunca el del celular.
     */
    create(userId: string, role: ProximityRole, groupId: string | null, now: Date): Promise<ProximityRow> {
      return db.transaction(async () => {
        await db.query('SELECT pg_advisory_xact_lock($1)', [PROXIMITY_LOCK_ID]);

        // 1. Un solo intento activo por usuario: el anterior que aún no venció se cancela, con su pareja.
        const active = await db.many<ProximityRow>(
          `SELECT ${COLUMNS} FROM proximity_requests p
           WHERE p.user_id = $1 AND ((p.status = 'WAITING' AND p.created_at > $2) OR (p.status = 'MATCHED' AND p.matched_at > $3))`,
          [userId, before(now, WAITING_TTL_MS), before(now, CONFIRM_TTL_MS)],
        );
        for (const row of active) await setPairStatus(row, 'CANCELLED');

        // 2. El aviso nuevo espera.
        const id = randomUUID();
        await db.query(
          "INSERT INTO proximity_requests (id, user_id, role, group_id, status, created_at) VALUES ($1, $2, $3, $4, 'WAITING', $5)",
          [id, userId, role, groupId, now.toISOString()],
        );

        const since = before(now, MATCH_WINDOW_MS);
        const params = [userId, role, groupId, since];

        // 3. Hacia adelante: si una pareja de hace menos de 3 s podría haber sido con este aviso, ya no se sabe cuál
        // era el celular de verdad. La pareja y el aviso nuevo quedan AMBIGUOUS.
        const pairs = await db.many<ProximityRow>(`${COUNTERPARTS} AND p.status = 'MATCHED' AND p.matched_at >= $4`, params);
        if (pairs.length > 0) {
          await setStatus([id, ...pairs.flatMap((p) => [p.id, p.peer_id!])], 'AMBIGUOUS');
          return (await findById(id))!;
        }

        // 4. Hacia atrás: los avisos que esperan desde hace menos de 3 s.
        const candidates = await db.many<ProximityRow>(`${COUNTERPARTS} AND p.status = 'WAITING' AND p.created_at >= $4`, params);
        if (candidates.length === 1) {
          const peerId = candidates[0].id;
          const link = "UPDATE proximity_requests SET status = 'MATCHED', peer_id = $1, matched_at = $2 WHERE id = $3";
          await db.query(link, [peerId, now.toISOString(), id]);
          await db.query(link, [id, now.toISOString(), peerId]);
        } else if (candidates.length > 1) {
          await setStatus([id, ...candidates.map((c) => c.id)], 'AMBIGUOUS');
        }
        return (await findById(id))!;
      });
    },

    /** Un intento, solo si es de ese usuario. */
    async findOwn(id: string, userId: string): Promise<ProximityRow | undefined> {
      return db.one<ProximityRow>(`SELECT ${COLUMNS} FROM proximity_requests p WHERE p.id = $1 AND p.user_id = $2`, [id, userId]);
    },

    /** La otra mitad de la pareja, si la tiene. */
    async findPeer(row: ProximityRow): Promise<ProximityRow | undefined> {
      return row.peer_id === null ? undefined : findById(row.peer_id);
    },

    setPairStatus,
  };
}
