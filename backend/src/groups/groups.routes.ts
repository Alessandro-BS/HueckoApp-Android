import type { GroupMember, MatchWindow } from '@hueckoapp/shared';
import { Router } from 'express';

import type { ResolvedDeps } from '../app';
import { getUserId } from '../auth/require-auth';
import { groupWindows } from '../availability/group-availability';
import { ApiError } from '../middleware/errors';
import { timeBlocksRepository } from '../schedule/time-blocks.repository';
import { loadGroupForMember } from './group-access';
import { groupsRepository } from './groups.repository';
import { createGroupSchema, joinGroupSchema, updateGroupSchema, updateMemberSchema } from './groups.schemas';

// Se monta detrás de requireAuth.
export function groupsRouter({ db, now }: ResolvedDeps) {
  const router = Router();
  const groups = groupsRepository(db);
  const blocks = timeBlocksRepository(db);

  // 404 si el grupo no existe; 403 si existe pero no soy miembro.
  const loadForMember = (groupId: string, userId: string) => loadGroupForMember(groups, groupId, userId);

  const loadForOwner = async (groupId: string, userId: string) => {
    const loaded = await loadForMember(groupId, userId);
    if (loaded.me.role !== 'OWNER') {
      throw new ApiError(403, 'NOT_OWNER', 'Solo el administrador del grupo puede hacer esto.');
    }
    return loaded;
  };

  router.get('/', async (_req, res) => {
    res.json(await groups.listForUser(getUserId(res)));
  });

  router.post('/', async (req, res) => {
    const input = createGroupSchema.parse(req.body);
    res.status(201).json(await groups.create(getUserId(res), { ...input, createdAt: now().toISOString() }));
  });

  router.post('/join', async (req, res) => {
    const { inviteCode } = joinGroupSchema.parse(req.body);
    const userId = getUserId(res);
    const groupId = await groups.findIdByInviteCode(inviteCode);
    if (!groupId) throw new ApiError(404, 'INVALID_INVITE_CODE', 'Código de invitación inválido.');
    // addMember no inserta si ya era miembro (también si llegan dos peticiones a la vez).
    if (!(await groups.addMember(groupId, userId))) throw new ApiError(409, 'ALREADY_MEMBER', 'Ya perteneces a este grupo.');
    res.json(await groups.findById(groupId));
  });

  router.get('/:id', async (req, res) => {
    res.json((await loadForMember(req.params.id, getUserId(res))).group);
  });

  // Permisos antes que validación: a quien no es OWNER no le importa por qué el cuerpo es inválido.
  router.patch('/:id', async (req, res) => {
    const { group } = await loadForOwner(req.params.id, getUserId(res));
    await groups.update(group.id, updateGroupSchema.parse(req.body));
    res.json(await groups.findById(group.id));
  });

  router.patch('/:id/members/:userId', async (req, res) => {
    const { group } = await loadForOwner(req.params.id, getUserId(res));
    const { isEssential } = updateMemberSchema.parse(req.body);
    const { userId } = req.params;
    if (!group.members.some((m) => m.id === userId)) {
      throw new ApiError(404, 'MEMBER_NOT_FOUND', 'Esa persona no pertenece al grupo.');
    }
    await groups.setEssential(group.id, userId, isEssential);
    const member: GroupMember = (await groups.findById(group.id))!.members.find((m) => m.id === userId)!;
    res.json(member);
  });

  router.delete('/:id/members/me', async (req, res) => {
    const userId = getUserId(res);
    const { group } = await loadForMember(req.params.id, userId);
    await groups.leave(group.id, userId);
    res.status(204).end();
  });

  router.get('/:id/availability', async (req, res) => {
    const { group } = await loadForMember(req.params.id, getUserId(res));
    const windows: MatchWindow[] = await groupWindows(group, blocks);
    res.json(windows);
  });

  return router;
}
