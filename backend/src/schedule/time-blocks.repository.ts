import { randomUUID } from 'node:crypto';

import type { BlockType, TimeBlock, TimeBlockInput } from '@hueckoapp/shared';

import type { Db } from '../db/db';
import { blocksOverlap, firstOverlap } from './block-overlap';

type TimeBlockRow = {
  id: string;
  user_id: string;
  label: string;
  type: BlockType;
  start_time: string;
  end_time: string;
  is_recurring: boolean;
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
  isRecurring: row.is_recurring,
  dayOfWeek: row.day_of_week,
  date: row.date,
});

// Recurrentes primero (por día y hora); después los puntuales (por fecha y hora); si empatan, orden de inserción.
const ORDER = 'ORDER BY is_recurring DESC, day_of_week, date, start_time, seq';

const lockUser = (db: Db, userId: string) => db.query('SELECT id FROM users WHERE id = $1 FOR UPDATE', [userId]);

export type BulkOverlap = { index: number; overlap: TimeBlock } | { index: number; otherIndex: number };

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

  const list = async (userId: string): Promise<TimeBlock[]> =>
    (await db.many<TimeBlockRow>(`SELECT * FROM time_blocks WHERE user_id = $1 ${ORDER}`, [userId])).map(toTimeBlock);

  return {
    listByUser: list,

    // Bloquea al usuario y comprueba los solapes después: dos guardados a la vez no se cuelan.
    create(userId: string, input: TimeBlockInput): Promise<TimeBlock | { overlap: TimeBlock }> {
      return db.transaction(async () => {
        await lockUser(db, userId);
        const overlap = firstOverlap(input, await list(userId));
        return overlap ? { overlap } : insert(userId, input);
      });
    },

    // undefined: no existe o es de otra persona. El bloque editado no choca consigo mismo.
    update(userId: string, id: string, input: TimeBlockInput): Promise<TimeBlock | { overlap: TimeBlock } | undefined> {
      return db.transaction(async () => {
        await lockUser(db, userId);
        const existing = await list(userId);
        if (!existing.some((block) => block.id === id)) return undefined;
        const overlap = firstOverlap(input, existing, id);
        if (overlap) return { overlap };
        await db.query(
          `UPDATE time_blocks SET label = $3, type = $4, start_time = $5, end_time = $6, is_recurring = $7, day_of_week = $8, date = $9
           WHERE id = $1 AND user_id = $2`,
          [id, userId, input.label, input.type, input.startTime, input.endTime, input.isRecurring, input.dayOfWeek, input.date],
        );
        return { id, userId, ...input };
      });
    },

    // Todo o nada: si uno choca, no queda ninguno guardado. Primero contra lo guardado, luego contra los anteriores del lote.
    createMany(userId: string, inputs: TimeBlockInput[]): Promise<TimeBlock[] | BulkOverlap> {
      return db.transaction(async () => {
        await lockUser(db, userId);
        const saved = await list(userId);
        for (let index = 0; index < inputs.length; index++) {
          const overlap = firstOverlap(inputs[index], saved);
          if (overlap) return { index, overlap };
          const otherIndex = inputs.slice(0, index).findIndex((other) => blocksOverlap(inputs[index], other));
          if (otherIndex >= 0) return { index, otherIndex };
        }
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
        `SELECT * FROM time_blocks WHERE is_recurring AND user_id = ANY($1::text[]) ${ORDER}`,
        [userIds],
      );
      return rows.map(toTimeBlock);
    },

    // Recurrentes + puntuales con fecha en [from, to] (YYYY-MM-DD, inclusivos) de varias personas.
    async listForUsersInRange(userIds: readonly string[], from: string, to: string): Promise<TimeBlock[]> {
      const rows = await db.many<TimeBlockRow>(
        `SELECT * FROM time_blocks
         WHERE user_id = ANY($1::text[]) AND (is_recurring OR (date >= $2 AND date <= $3)) ${ORDER}`,
        [userIds, from, to],
      );
      return rows.map(toTimeBlock);
    },
  };
}
