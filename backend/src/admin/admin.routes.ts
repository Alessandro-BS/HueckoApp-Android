import { Router, type Response } from 'express';

import type { ResolvedDeps } from '../app';
import { getUserId } from '../auth/require-auth';
import { adminUsers, type AdminActor } from './admin-users';
import { listQuerySchema, pageQuerySchema, userRoleSchema, userStatusSchema } from './admin.schemas';
import { auditRepository } from './audit.repository';

// Montado en /api/admin detrás de requireAuth y requireAdmin: todo lo de aquí es solo para ADMIN.
export function adminRouter({ db, now }: ResolvedDeps) {
  const router = Router();
  const users = adminUsers(db);
  const audit = auditRepository(db);
  const actor = (res: Response): AdminActor => ({ adminId: getUserId(res), now: now() });

  router.get('/users', (req, res) => {
    const { search, page } = listQuerySchema.parse(req.query);
    res.json(users.list(search, page));
  });

  router.get('/users/:id', (req, res) => {
    res.json(users.detail(req.params.id));
  });

  // Validación antes que existencia: un cuerpo inválido es 400 aunque la cuenta no exista.
  router.patch('/users/:id/status', (req, res) => {
    const { status } = userStatusSchema.parse(req.body);
    users.setStatus(actor(res), req.params.id, status);
    res.json(users.detail(req.params.id));
  });

  router.patch('/users/:id/role', (req, res) => {
    const { role } = userRoleSchema.parse(req.body);
    users.setRole(actor(res), req.params.id, role);
    res.json(users.detail(req.params.id));
  });

  router.get('/audit', (req, res) => {
    const { page } = pageQuerySchema.parse(req.query);
    res.json(audit.list(page));
  });

  return router;
}
