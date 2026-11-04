import type { ProximityStatus } from '@hueckoapp/shared';

import type { ProximityRow } from './proximity.repository';

// Tiempos de «unirse acercando el celular», siempre con el reloj del servidor.
/** Dos avisos de rol opuesto se emparejan si llegan con menos de esto entre sí. */
export const MATCH_WINDOW_MS = 3000;
/** Un aviso sin pareja vence a los 5 s de created_at. */
export const WAITING_TTL_MS = 5000;
/** Una pareja sin respuesta vence a los 30 s de matched_at. */
export const CONFIRM_TTL_MS = 30_000;
/** Quien invita puede aceptar a partir de matched_at + 3 s (antes, otro aviso aún podría anular la pareja). */
export const ACCEPT_DELAY_MS = 3000;

// Candado de los avisos por proximidad: dos avisos a la vez se emparejan uno tras otro, así el segundo siempre ve al primero.
export const PROXIMITY_LOCK_ID = 72_616_003;

const elapsed = (since: string, now: Date) => now.getTime() - new Date(since).getTime();

/** El estado tal como se ve ahora: WAITING y MATCHED vencen solos (sin tareas en segundo plano). */
export function effectiveStatus(row: ProximityRow, now: Date): ProximityStatus {
  if (row.status === 'WAITING' && elapsed(row.created_at, now) >= WAITING_TTL_MS) return 'EXPIRED';
  if (row.status === 'MATCHED' && row.matched_at !== null && elapsed(row.matched_at, now) >= CONFIRM_TTL_MS) return 'EXPIRED';
  return row.status;
}
