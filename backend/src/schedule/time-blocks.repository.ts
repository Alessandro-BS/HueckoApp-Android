import { randomUUID } from 'node:crypto';

import type { BlockType, TimeBlock, TimeBlockInput } from '@hueckoapp/shared';

import type { Db } from '../db/database';
import { withTransaction } from '../db/transaction';

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
  const insert = (userId: string, input: TimeBlockInput): TimeBlock => {
    const id = randomUUID();
    db.prepare(
      `INSERT INTO time_blocks (id, user_id, label, type, start_time, end_time, is_recurring, day_of_week, date)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    ).run(
      id, userId, input.label, input.type, input.startTime, input.endTime,
      input.isRecurring ? 1 : 0, input.dayOfWeek, input.date,
    );
    return { id, userId, ...input };
  };

  return {
    listByUser(userId: string): TimeBlock[] {
      const rows = db.prepare(`SELECT * FROM time_blocks WHERE user_id = ? ${ORDER}`).all(userId) as TimeBlockRow[];
      return rows.map(toTimeBlock);
    },

    create: insert,

    // Todo o nada: si falla uno, no queda ninguno guardado.
    createMany(userId: string, inputs: TimeBlockInput[]): TimeBlock[] {
      return withTransaction(db, () => inputs.map((input) => insert(userId, input)));
    },

    // false si no existe o es de otra persona.
    delete(userId: string, id: string): boolean {
      const { changes } = db.prepare('DELETE FROM time_blocks WHERE id = ? AND user_id = ?').run(id, userId);
      return Number(changes) > 0;
    },

    // Bloques recurrentes de varias personas (para el cruce de un grupo). json_each evita armar "IN (?, ?, …)".
    listRecurringByUsers(userIds: readonly string[]): TimeBlock[] {
      const rows = db
        .prepare(`SELECT * FROM time_blocks WHERE is_recurring = 1 AND user_id IN (SELECT value FROM json_each(?)) ${ORDER}`)
        .all(JSON.stringify(userIds)) as TimeBlockRow[];
      return rows.map(toTimeBlock);
    },
  };
}
