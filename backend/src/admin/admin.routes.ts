import type { PopularHours, Timeseries } from '@hueckoapp/shared';
import { Router, type Response } from 'express';

import type { ResolvedDeps } from '../app';
import { getUserId } from '../auth/require-auth';
import { adminGroups } from './admin-groups';
import { adminUsers, type AdminActor } from './admin-users';
import {
  cancelProposalSchema, listQuerySchema, optionalRangeQuerySchema, pageQuerySchema, rangeQuerySchema, timeseriesQuerySchema,
  userRoleSchema, userStatusSchema,
} from './admin.schemas';
import { auditRepository } from './audit.repository';
import { adminReport, adminStats, popularHours, timeseries } from './stats';

// Montado en /api/admin detrás de requireAuth y requireAdmin: todo lo de aquí es solo para ADMIN.
export function adminRouter({ db, now }: ResolvedDeps) {
  const router = Router();
  const users = adminUsers(db);
  const audit = auditRepository(db);
  const groups = adminGroups(db);
  const actor = (res: Response): AdminActor => ({ adminId: getUserId(res), now: now() });

  // Estadísticas e informes: todo se calcula aquí, en la zona del servidor; la app solo lo muestra y lo exporta.
  router.get('/stats', (_req, res) => {
    res.json(adminStats(db));
  });

  router.get('/stats/timeseries', (req, res) => {
    const { range, fromDate, toDate, bucket } = timeseriesQuerySchema.parse(req.query);
    const body: Timeseries = { from: fromDate, to: toDate, bucket, points: timeseries(db, range, bucket) };
    res.json(body);
  });

  router.get('/stats/popular-hours', (req, res) => {
    const period = optionalRangeQuerySchema.parse(req.query);
    const body: PopularHours = {
      from: period?.fromDate ?? null,
      to: period?.toDate ?? null,
      hours: popularHours(db, period?.range ?? null),
    };
    res.json(body);
  });

  router.get('/reports', (req, res) => {
    res.json(adminReport(db, rangeQuerySchema.parse(req.query).range, now()));
  });

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

  router.get('/groups', (req, res) => {
    const { search, page } = listQuerySchema.parse(req.query);
    res.json(groups.list(search, page));
  });

  router.get('/groups/:id', (req, res) => {
    res.json(groups.detail(req.params.id));
  });

  router.delete('/groups/:id', (req, res) => {
    groups.remove(actor(res), req.params.id);
    res.status(204).end();
  });

  // Moderación: cancelar la propuesta de cualquier grupo (D7). Sin cuerpo o con { reason }.
  router.post('/proposals/:id/cancel', (req, res) => {
    const { reason } = cancelProposalSchema.parse(req.body ?? {});
    res.json(groups.cancelProposal(actor(res), req.params.id, reason || null));
  });

  router.get('/audit', (req, res) => {
    const { page } = pageQuerySchema.parse(req.query);
    res.json(audit.list(page));
  });

  return router;
}
