import type { ProximityRequest, ProximityStatus } from '@hueckoapp/shared';
import { Router } from 'express';

import type { ResolvedDeps } from '../app';
import { getUserId } from '../auth/require-auth';
import { isForeignKeyViolation } from '../db/errors';
import { groupNotFound, loadGroupForMember } from '../groups/group-access';
import { groupsRepository } from '../groups/groups.repository';
import { ApiError } from '../middleware/errors';
import { ACCEPT_DELAY_MS, CONFIRM_TTL_MS, effectiveStatus, PROXIMITY_LOCK_ID, WAITING_TTL_MS } from './proximity-rules';
import { proximityRepository, type ProximityRow } from './proximity.repository';
import { inviteProximitySchema, joinProximitySchema } from './proximity.schemas';

// Estados en los que ya se conoce (y se muestra) a la otra persona. En AMBIGUOUS la fila guarda un peer_id viejo: no se filtra.
const PEER_VISIBLE: ProximityStatus[] = ['MATCHED', 'ACCEPTED', 'REJECTED'];

const notFound = () => new ApiError(404, 'PROXIMITY_NOT_FOUND', 'Intento no encontrado.');
const notPending = () => new ApiError(409, 'PROXIMITY_NOT_PENDING', 'Esta solicitud ya no se puede responder.');

const plus = (iso: string, ms: number) => new Date(new Date(iso).getTime() + ms).toISOString();

// Se monta detrás de requireAuth.
export function proximityRouter({ db, now }: ResolvedDeps) {
  const router = Router();
  const proximity = proximityRepository(db);
  const groups = groupsRepository(db);

  const lock = () => db.query('SELECT pg_advisory_xact_lock($1)', [PROXIMITY_LOCK_ID]);

  const toDto = async (row: ProximityRow, at: Date): Promise<ProximityRequest> => {
    const status = effectiveStatus(row, at);
    const peerVisible = PEER_VISIBLE.includes(status);
    const peerRow = peerVisible ? await proximity.findPeer(row) : undefined;
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

  router.post('/invite', async (req, res) => {
    const { groupId } = inviteProximitySchema.parse(req.body);
    const userId = getUserId(res);
    await loadGroupForMember(groups, groupId, userId);
    const at = now();
    const row = await proximity.create(userId, 'INVITE', groupId, at).catch((error: unknown) => {
      // El grupo se borró justo ahora.
      throw isForeignKeyViolation(error, 'proximity_requests_group_id_fkey') ? groupNotFound() : error;
    });
    res.status(201).json(await toDto(row, at));
  });

  router.post('/join', async (req, res) => {
    joinProximitySchema.parse(req.body);
    const at = now();
    const row = await proximity.create(getUserId(res), 'JOIN', null, at);
    res.status(201).json(await toDto(row, at));
  });

  router.get('/:id', async (req, res) => {
    const row = await proximity.findOwn(req.params.id, getUserId(res));
    if (!row) throw notFound();
    res.json(await toDto(row, now()));
  });

  // Responder: solo quien invita, con la pareja vigente y pasados los 3 s (estrictamente: el milisegundo +3000 aún
  // puede ser anulado por otro aviso, ver proximity.repository).
  const respond = (verdict: 'ACCEPTED' | 'REJECTED') => async (req: { params: { id: string } }, res: Parameters<typeof getUserId>[0]) => {
    const userId = getUserId(res);
    const at = now();
    let groupGone: ProximityRow | undefined;
    try {
      const row = await db.transaction(async () => {
        await lock();
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
          const peer = (await proximity.findPeer(own))!;
          // Si ya era miembro (se unió con el código), la pareja queda ACCEPTED igual.
          await groups.addMember(own.group_id!, peer.user_id).catch((error: unknown) => {
            if (isForeignKeyViolation(error, 'group_members_group_id_fkey')) groupGone = own;
            throw error;
          });
        }
        await proximity.setPairStatus(own, verdict);
        return (await proximity.findOwn(own.id, userId))!;
      });
      res.json(await toDto(row, at));
    } catch (error) {
      if (!groupGone) throw error;
      // El grupo se borró: Postgres deshizo la transacción, así que la pareja se marca aparte.
      await db.transaction(async () => {
        await lock();
        const current = await proximity.findOwn(groupGone!.id, userId);
        // La mitad de quien invita se borró con el grupo (ON DELETE CASCADE); queda la de quien se une.
        await proximity.setPairStatus(current ?? groupGone!, 'EXPIRED');
      });
      throw groupNotFound();
    }
  };

  router.post('/:id/accept', (req, res) => respond('ACCEPTED')(req, res));
  router.post('/:id/reject', (req, res) => respond('REJECTED')(req, res));

  router.delete('/:id', async (req, res) => {
    const userId = getUserId(res);
    const at = now();
    await db.transaction(async () => {
      await lock();
      const own = await proximity.findOwn(req.params.id, userId);
      if (!own) throw notFound();
      const status = effectiveStatus(own, at);
      if (status === 'WAITING' || status === 'MATCHED') await proximity.setPairStatus(own, 'CANCELLED');
    });
    res.status(204).end();
  });

  return router;
}
