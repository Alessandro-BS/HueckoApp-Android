import { randomUUID } from 'node:crypto';

import type { BlockType, TimeBlock, TimeBlockInput } from '@hueckoapp/shared';

import type { Db } from '../db/db';

type TimeBlockRow = {
  id: string;
  user_id: string;
  label: string;
  type: BlockType;
  start_time: string;
  end_time: string;
  is_recurring: number;
  day_of_week: number | null;
  date: string | null;
};

const toTimeBlock = (row: TimeBlockRow): TimeBlock => ({
  id: row.id,
  userId: row.user_id,
  label: row.label,
  type: row.type,
  startTime: row.start_time,
  endTime: row.end_time,
  isRecurring: row.is_recurring === 1,
  dayOfWeek: row.day_of_week,
  date: row.date,
});

// Recurrentes primero (por día y hora); después los puntuales (por fecha y hora).
const ORDER = 'ORDER BY is_recurring DESC, day_of_week, date, start_time, rowid';

export function timeBlocksRepository(db: Db) {
  const insert = async (userId: string, input: TimeBlockInput): Promise<TimeBlock> => {
    const id = randomUUID();
    await db.query(
      `INSERT INTO time_blocks (id, user_id, label, type, start_time, end_time, is_recurring, day_of_week, date)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)`,
      [id, userId, input.label, input.type, input.startTime, input.endTime, input.isRecurring, input.dayOfWeek, input.date],
    );
    return { id, userId, ...input };
  };

  return {
    async listByUser(userId: string): Promise<TimeBlock[]> {
      const rows = await db.many<TimeBlockRow>(`SELECT * FROM time_blocks WHERE user_id = $1 ${ORDER}`, [userId]);
      return rows.map(toTimeBlock);
    },

    create: insert,

    // Todo o nada: si falla uno, no queda ninguno guardado. Uno tras otro, en el orden recibido.
    createMany(userId: string, inputs: TimeBlockInput[]): Promise<TimeBlock[]> {
      return db.transaction(async () => {
        const created: TimeBlock[] = [];
        for (const input of inputs) created.push(await insert(userId, input));
        return created;
      });
    },

    // false si no existe o es de otra persona.
    async delete(userId: string, id: string): Promise<boolean> {
      const { rowCount } = await db.query('DELETE FROM time_blocks WHERE id = $1 AND user_id = $2', [id, userId]);
      return rowCount > 0;
    },

    // Bloques recurrentes de varias personas (para el cruce de un grupo), con la lista de ids en UN parámetro.
    async listRecurringByUsers(userIds: readonly string[]): Promise<TimeBlock[]> {
      const rows = await db.many<TimeBlockRow>(
        `SELECT * FROM time_blocks WHERE is_recurring AND user_id IN (SELECT value FROM json_each($1)) ${ORDER}`,
        [JSON.stringify(userIds)],
      );
      return rows.map(toTimeBlock);
    },
  };
}
