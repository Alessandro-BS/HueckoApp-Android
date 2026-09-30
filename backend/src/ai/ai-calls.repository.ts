import type { AiTask } from '@hueckoapp/shared';

import type { Db } from '../db/database';
import type { AiCallRecorder } from './ask-ai';

export type NewAiCall = { userId: string | null; task: AiTask; ok: boolean; durationMs: number; createdAt: string };

// Registro de llamadas a la IA para las estadísticas de administración (D6). Nunca guarda el prompt ni la respuesta.
export function aiCallsRepository(db: Db) {
  const insert = db.prepare('INSERT INTO ai_calls (user_id, task, ok, duration_ms, created_at) VALUES (?, ?, ?, ?, ?)');
  return {
    record(call: NewAiCall): void {
      insert.run(call.userId, call.task, call.ok ? 1 : 0, Math.max(0, Math.round(call.durationMs)), call.createdAt);
    },
  };
}

export type AiCallsRepository = ReturnType<typeof aiCallsRepository>;

// El `record` que recibe askAi en una petición: quién la hizo y cuándo empezó (reloj de la app).
export function aiCallRecorder(calls: AiCallsRepository, userId: string, startedAt: Date): AiCallRecorder {
  const createdAt = startedAt.toISOString();
  return ({ task, ok, durationMs }) => calls.record({ userId, task, ok, durationMs, createdAt });
}
