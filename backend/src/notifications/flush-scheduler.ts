import type { Db } from '../db/db';
import { flushNotifications, logFlushError } from './flush';
import type { PushClient } from './push-client';

/**
 * Envío inmediato: `kick()` pide un envío en segundo plano. Como mucho uno en curso y uno pendiente: los pedidos que
 * llegan mientras se envía se juntan en una pasada más al terminar (que verá también lo que encolaron). Nunca lanza.
 * Cada envío que arranca se entrega a `onBackgroundTask` para que los tests lo esperen.
 */
export function createFlushScheduler({
  db,
  push,
  now,
  onBackgroundTask,
}: {
  db: Db;
  push: PushClient;
  now: () => Date;
  onBackgroundTask?: (task: Promise<void>) => void;
}): { kick(): void } {
  let running = false;
  let again = false;

  async function run(): Promise<void> {
    try {
      do {
        again = false;
        try {
          await flushNotifications(db, push, now());
        } catch (error) {
          logFlushError(error);
        }
      } while (again);
    } finally {
      running = false;
    }
  }

  return {
    kick() {
      if (running) {
        again = true;
        return;
      }
      running = true;
      onBackgroundTask?.(run());
    },
  };
}
