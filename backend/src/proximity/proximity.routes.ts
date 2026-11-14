import type { ProximityRequest, ProximityStatus } from '@hueckoapp/shared';
import { Router } from 'express';
import rateLimit from 'express-rate-limit';

import type { ResolvedDeps } from '../app';
import { getUserId } from '../auth/require-auth';
import { isForeignKeyViolation } from '../db/errors';
import { groupNotFound, loadGroupForMember } from '../groups/group-access';
import { groupsRepository } from '../groups/groups.repository';
import { ApiError } from '../middleware/errors';
import { closeDueBeforeMembershipChange } from '../proposals/voting-close';
import { ACCEPT_DELAY_MS, CONFIRM_TTL_MS, effectiveStatus, PROXIMITY_LOCK_ID, WAITING_TTL_MS } from './proximity-rules';
import { proximityRepository, type ProximityRow } from './proximity.repository';
import { inviteProximitySchema, joinProximitySchema } from './proximity.schemas';

// Estados en los que ya se conoce (y se muestra) a la otra persona. En AMBIGUOUS la fila guarda un peer_id viejo: no se filtra.
const PEER_VISIBLE: ProximityStatus[] = ['MATCHED', 'ACCEPTED', 'REJECTED'];

const notFound = () => new ApiError(404, 'PROXIMITY_NOT_FOUND', 'Intento no encontrado.');
const notAMember = () => new ApiError(403, 'NOT_A_MEMBER', 'No perteneces a este grupo.');
const notPending = () => new ApiError(409, 'PROXIMITY_NOT_PENDING', 'Esta solicitud ya no se puede responder.');

export const PROXIMITY_RATE_LIMIT_DEFAULT = 10;

// Avisos (invite + join, mismo contador) por usuario y minuto. Un intento normal es un aviso; con 10 se puede repetir
// de sobra y se frena a quien los manda en bucle para colarse en emparejamientos ajenos. Va detrás de requireAuth.
function proximityLimiter(limit: number) {
  return rateLimit({
    windowMs: 60 * 1000,
    limit,
    standardHeaders: 'draft-8',
    legacyHeaders: false,
    keyGenerator: (_req, res) => `user:${getUserId(res)}`,
    handler: (_req, _res, next) => next(new ApiError(429, 'TOO_MANY_REQUESTS', 'Demasiados intentos. Espera un momento.')),
  });
}

const plus = (iso: string, ms: number) => new Date(new Date(iso).getTime() + ms).toISOString();

// Se monta detrás de requireAuth.
export function proximityRouter({ db, now, proximityRateLimit = PROXIMITY_RATE_LIMIT_DEFAULT }: ResolvedDeps) {
  const router = Router();
  const limiter = proximityLimiter(proximityRateLimit);
  const proximity = proximityRepository(db);
  const groups = groupsRepository(db);

  const lock = () => db.query('SELECT pg_advisory_xact_lock($1)', [PROXIMITY_LOCK_ID]);

  const toDto = async (row: ProximityRow, at: Date): Promise<ProximityRequest> => {
    let status = effectiveStatus(row, at);
    let peerRow = PEER_VISIBLE.includes(status) ? await proximity.findPeer(row) : undefined;
    // La otra mitad se borró (su grupo o su usuario, en cascada): la pareja ya no existe, aunque esta mitad siga en MATCHED.
    if (status === 'MATCHED' && !peerRow) status = 'EXPIRED';
    const peerVisible = PEER_VISIBLE.includes(status);
    if (!peerVisible) peerRow = undefined;
    // INVITE: su propio grupo; JOIN: el de la otra persona, solo cuando ya hay pareja.
    const groupId = row.role === 'INVITE' ? row.group_id : peerVisible ? (peerRow?.group_id ?? null) : null;
    const group = groupId ? await groups.findById(groupId) : undefined;
    const peerUser = peerRow ? await db.one<{ id: string; name: string }>('SELECT id, name FROM users WHERE id = $1', [peerRow.user_id]) : undefined;
    return {
      id: row.id,
      role: row.role,
      status,
      group: group ? { id: group.id, name: group.name } : null,
      peer: peerUser ? { id: peerUser.id, name: peerUser.name } : null,
      expiresAt:
        status === 'WAITING' ? plus(row.created_at, WAITING_TTL_MS) : status === 'MATCHED' ? plus(row.matched_at!, CONFIRM_TTL_MS) : null,
      acceptableFrom: status === 'MATCHED' ? plus(row.matched_at!, ACCEPT_DELAY_MS) : null,
    };
  };

  router.post('/invite', limiter, async (req, res) => {
    const { groupId } = inviteProximitySchema.parse(req.body);
    const userId = getUserId(res);
    await loadGroupForMember(groups, groupId, userId);
    // La hora se toma con el candado ya puesto: quien esperó turno no usa una hora vieja (create lo vuelve a pedir, es reentrante).
    const { row, at } = await db
      .transaction(async () => {
        await lock();
        const at = now();
        return { row: await proximity.create(userId, 'INVITE', groupId, at), at };
      })
      .catch((error: unknown) => {
        // El grupo se borró justo ahora.
        throw isForeignKeyViolation(error, 'proximity_requests_group_id_fkey') ? groupNotFound() : error;
      });
    res.status(201).json(await toDto(row, at));
  });

  router.post('/join', limiter, async (req, res) => {
    joinProximitySchema.parse(req.body);
    const userId = getUserId(res);
    const { row, at } = await db.transaction(async () => {
      await lock();
      const at = now();
      return { row: await proximity.create(userId, 'JOIN', null, at), at };
    });
    res.status(201).json(await toDto(row, at));
  });

  router.get('/:id', async (req, res) => {
    const row = await proximity.findOwn(req.params.id, getUserId(res));
    if (!row) throw notFound();
    res.json(await toDto(row, now()));
  });

  // Responder: solo quien invita, con la pareja vigente y pasados los 3 s (estrictamente: el milisegundo +3000 aún
  // puede ser anulado por otro aviso; ver proximity-rules.ts y docs/api.md).
  const respond = (verdict: 'ACCEPTED' | 'REJECTED') => async (req: { params: { id: string } }, res: Parameters<typeof getUserId>[0]) => {
    const userId = getUserId(res);
    let groupGone: ProximityRow | undefined;
    if (verdict === 'ACCEPTED') {
      // Aceptar mete a alguien en el grupo: antes se cierran sus votaciones vencidas (fuera de la transacción de abajo,
      // porque cada cierre abre la suya). El grupo de una invitación no cambia; lo demás lo comprueba la transacción.
      const invite = await proximity.findOwn(req.params.id, userId);
      if (invite?.role === 'INVITE' && invite.group_id) await closeDueBeforeMembershipChange(db, invite.group_id, now());
    }
    let at = now();
    try {
      const row = await db.transaction(async () => {
        await lock();
        at = now();
        const own = await proximity.findOwn(req.params.id, userId);
        if (!own) throw notFound();
        if (
          own.role !== 'INVITE' ||
          effectiveStatus(own, at) !== 'MATCHED' ||
          at.getTime() <= new Date(own.matched_at!).getTime() + ACCEPT_DELAY_MS
        ) {
          throw notPending();
        }
        if (verdict === 'ACCEPTED') {
          const peer = await proximity.findPeer(own);
          if (!peer) throw notPending(); // la otra mitad ya no existe (su usuario se borró)
          // Quien invita salió del grupo después de invitar: ya no puede meter a nadie. La pareja vence.
          const member = await db.one('SELECT 1 FROM group_members WHERE group_id = $1 AND user_id = $2', [own.group_id, userId]);
          if (!member) {
            await proximity.setPairStatus(own, 'EXPIRED');
            return null;
          }
          // Si ya era miembro (se unió con el código), la pareja queda ACCEPTED igual.
          await groups.addMember(own.group_id!, peer.user_id).catch((error: unknown) => {
            if (isForeignKeyViolation(error, 'group_members_group_id_fkey')) groupGone = own;
            throw error;
          });
        }
        await proximity.setPairStatus(own, verdict);
        return (await proximity.findOwn(own.id, userId))!;
      });
      if (!row) throw notAMember();
      res.json(await toDto(row, at));
    } catch (error) {
      if (!groupGone) throw error;
      // El grupo se borró: Postgres deshizo la transacción, así que la pareja se marca aparte.
      await db.transaction(async () => {
        await lock();
        // Solo pasan a EXPIRED las mitades que siguen en MATCHED: otra petición pudo cancelarlas mientras tanto.
        // (La de quien invita puede haberse borrado con el grupo, ON DELETE CASCADE.)
        const ids = [groupGone!.id, ...(groupGone!.peer_id ? [groupGone!.peer_id] : [])];
        await db.query("UPDATE proximity_requests SET status = 'EXPIRED' WHERE id = ANY($1::text[]) AND status = 'MATCHED'", [ids]);
      });
      throw groupNotFound();
    }
  };

  router.post('/:id/accept', (req, res) => respond('ACCEPTED')(req, res));
  router.post('/:id/reject', (req, res) => respond('REJECTED')(req, res));

  router.delete('/:id', async (req, res) => {
    const userId = getUserId(res);
    await db.transaction(async () => {
      await lock();
      const at = now();
      const own = await proximity.findOwn(req.params.id, userId);
      if (!own) throw notFound();
      const status = effectiveStatus(own, at);
      if (status === 'WAITING' || status === 'MATCHED') await proximity.setPairStatus(own, 'CANCELLED');
    });
    res.status(204).end();
  });

  return router;
}
