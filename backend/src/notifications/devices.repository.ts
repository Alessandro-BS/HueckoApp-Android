import type { Db } from '../db/db';

export function devicesRepository(db: Db) {
  return {
    // Un token es de un solo celular: si ya existía (aunque fuera de otra cuenta), pasa a esta persona.
    async upsert(userId: string, token: string, now: Date): Promise<void> {
      const at = now.toISOString();
      await db.query(
        `INSERT INTO push_devices (token, user_id, created_at, last_seen_at) VALUES ($1, $2, $3, $3)
         ON CONFLICT (token) DO UPDATE SET user_id = EXCLUDED.user_id, last_seen_at = EXCLUDED.last_seen_at`,
        [token, userId, at],
      );
    },

    // Solo si es mío: borrar el token de otra persona no hace nada.
    async remove(userId: string, token: string): Promise<void> {
      await db.query('DELETE FROM push_devices WHERE token = $1 AND user_id = $2', [token, userId]);
    },

    // Para DeviceNotRegistered: Expo dice que ese celular ya no existe.
    async removeToken(token: string): Promise<void> {
      await db.query('DELETE FROM push_devices WHERE token = $1', [token]);
    },

    async tokensOf(userIds: readonly string[]): Promise<Map<string, string[]>> {
      const byUser = new Map<string, string[]>();
      if (userIds.length === 0) return byUser;
      const rows = await db.many<{ user_id: string; token: string }>(
        'SELECT user_id, token FROM push_devices WHERE user_id = ANY($1::text[]) ORDER BY created_at, token',
        [[...userIds]],
      );
      for (const { user_id, token } of rows) byUser.set(user_id, [...(byUser.get(user_id) ?? []), token]);
      return byUser;
    },
  };
}
