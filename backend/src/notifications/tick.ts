import type { Db } from '../db/db';
import { expressVotesRepository } from '../proposals/express-votes.repository';
import { closeDueProposals } from '../proposals/voting-close';
import { flushNotifications } from './flush';
import type { PushClient } from './push-client';
import { enqueueDueReminders } from './reminders';

export type TickResult = { closed: number; reminders: number; sent: number };

/**
 * El barrido (cada minuto desde index.ts y cada ~10 min desde GitHub Actions): cierra las votaciones de franjas y las
 * exprés vencidas de todos los grupos, encola los recordatorios de la próxima hora y envía lo pendiente (sin `push`
 * no se envía nada). Nunca lanza: cada paso que falla se anota y se devuelve lo que sí se hizo.
 */
export async function tick(db: Db, push: PushClient | undefined, now: Date): Promise<TickResult> {
  const result: TickResult = { closed: 0, reminders: 0, sent: 0 };
  try {
    result.closed += await closeDueProposals(db, { all: true }, now);
    result.closed += await expressVotesRepository(db).closeDueInScope({ all: true }, now);
  } catch (error) {
    logTickError(error);
  }
  try {
    result.reminders = await enqueueDueReminders(db, now);
  } catch (error) {
    logTickError(error);
  }
  try {
    if (push) result.sent = (await flushNotifications(db, push, now)).sent;
  } catch (error) {
    logTickError(error);
  }
  return result;
}

function logTickError(error: unknown): void {
  if (process.env.NODE_ENV === 'test') return;
  console.error('El barrido de avisos falló:', error instanceof Error ? error.message : error);
}
