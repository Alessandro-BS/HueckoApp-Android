import request from 'supertest';
import { describe, expect, it } from 'vitest';

import type { ResolvedDeps } from '../src/app';
import { adminRouter } from '../src/admin/admin.routes';
import { openDatabase } from '../src/db/database';
import { registerAdmin } from './admin-fixtures';
import { bearer, makeTestApp, NOW, registerUser } from './helpers';

type Method = 'get' | 'patch' | 'delete' | 'post';

// Todas las rutas de /api/admin. El primer test comprueba que la lista coincide con el router:
// una ruta nueva sin fila aquí hace fallar la suite.
const ROUTES: [Method, string][] = [
  ['get', '/users'],
  ['get', '/users/:id'],
  ['patch', '/users/:id/status'],
  ['patch', '/users/:id/role'],
  ['get', '/groups'],
  ['get', '/groups/:id'],
  ['delete', '/groups/:id'],
  ['post', '/proposals/:id/cancel'],
  ['get', '/audit'],
  ['get', '/stats'],
  ['get', '/stats/timeseries'],
  ['get', '/stats/popular-hours'],
  ['get', '/reports'],
];

const call = (app: Parameters<typeof request>[0], method: Method, path: string) =>
  request(app)[method](`/api/admin${path.replace(':id', 'cualquiera')}`);

describe('acceso a /api/admin (todas las rutas)', () => {
  it('la tabla cubre exactamente las rutas del router', () => {
    const router = adminRouter({ db: openDatabase(':memory:'), now: () => NOW } as ResolvedDeps);
    const registered = (router.stack as { route?: { path: string; methods: Record<string, boolean> } }[])
      .flatMap((layer) => (layer.route ? Object.keys(layer.route.methods).map((m) => `${m} ${layer.route!.path}`) : []))
      .sort();
    expect(registered).toEqual(ROUTES.map(([m, p]) => `${m} ${p}`).sort());
  });

  it.each(ROUTES)('%s %s: sin token → 401; USER → 403 NOT_ADMIN; ADMIN suspendido → 403 ACCOUNT_SUSPENDED', async (method, path) => {
    const { app, db } = makeTestApp({ now: () => NOW });
    const ana = await registerUser(app);
    const admin = await registerAdmin(app, db);
    const suspended = await registerAdmin(app, db, { name: 'Admin suspendido' });
    db.prepare("UPDATE users SET status = 'SUSPENDED' WHERE id = ?").run(suspended.user.id);

    const anonymous = await call(app, method, path);
    expect(anonymous.status).toBe(401);
    expect(anonymous.body.error.code).toBe('UNAUTHORIZED');

    const user = await call(app, method, path).set(bearer(ana.token));
    expect(user.status).toBe(403);
    expect(user.body.error.code).toBe('NOT_ADMIN');

    const blocked = await call(app, method, path).set(bearer(suspended.token));
    expect(blocked.status).toBe(403);
    expect(blocked.body.error.code).toBe('ACCOUNT_SUSPENDED');

    // Control positivo: un ADMIN activo pasa la barrera (la ruta puede responder 200, 204, 400 o 404, nunca 401/403 ni 5xx).
    const ok = await call(app, method, path).set(bearer(admin.token));
    expect([401, 403]).not.toContain(ok.status);
    expect(ok.status).toBeLessThan(500);
  });
});
