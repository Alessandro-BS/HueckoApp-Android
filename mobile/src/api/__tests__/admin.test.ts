import type { AxiosAdapter, InternalAxiosRequestConfig } from 'axios';

import * as admin from '../admin';
import { api } from '../client';

const original = api.defaults.adapter;
let calls: InternalAxiosRequestConfig[] = [];
const recorder: AxiosAdapter = async (config) => {
  calls.push(config);
  return { data: {}, status: 200, statusText: '', headers: {}, config };
};

beforeEach(() => {
  calls = [];
  api.defaults.adapter = recorder;
});
afterAll(() => {
  api.defaults.adapter = original;
});

// El periodo viaja como días de calendario «YYYY-MM-DD», ambos incluidos (A1): la zona del teléfono no influye.
const range = { from: '2026-09-01', to: '2026-09-30' };

// [método, url, llamada, parámetros de la query, cuerpo]
it.each<[string, string, () => Promise<unknown>, unknown, unknown]>([
  ['GET', '/admin/stats', () => admin.getAdminStats(), undefined, undefined],
  ['GET', '/admin/stats/timeseries', () => admin.getTimeseries(range, 'day'), { ...range, bucket: 'day' }, undefined],
  ['GET', '/admin/stats/popular-hours', () => admin.getPopularHours(), undefined, undefined],
  ['GET', '/admin/stats/popular-hours', () => admin.getPopularHours(range), range, undefined],
  ['GET', '/admin/reports', () => admin.getReport(range), range, undefined],
  ['GET', '/admin/users', () => admin.listAdminUsers('ana', 2), { search: 'ana', page: 2 }, undefined],
  ['GET', '/admin/users/u%202', () => admin.getAdminUser('u 2'), undefined, undefined],
  ['PATCH', '/admin/users/u2/status', () => admin.setUserStatus('u2', 'SUSPENDED'), undefined, { status: 'SUSPENDED' }],
  ['PATCH', '/admin/users/u2/role', () => admin.setUserRole('u2', 'ADMIN'), undefined, { role: 'ADMIN' }],
  ['GET', '/admin/groups', () => admin.listAdminGroups('', 1), { search: '', page: 1 }, undefined],
  ['GET', '/admin/groups/g1', () => admin.getAdminGroup('g1'), undefined, undefined],
  ['DELETE', '/admin/groups/g1', () => admin.deleteAdminGroup('g1'), undefined, undefined],
  ['POST', '/admin/proposals/p1/cancel', () => admin.cancelProposalAsAdmin('p1'), undefined, {}],
  ['POST', '/admin/proposals/p1/cancel', () => admin.cancelProposalAsAdmin('p1', 'Spam'), undefined, { reason: 'Spam' }],
  ['GET', '/admin/audit', () => admin.listAudit(3), { page: 3 }, undefined],
])('%s %s', async (method, url, call, params, body) => {
  await call();
  expect(calls).toHaveLength(1);
  expect(calls[0].method?.toUpperCase()).toBe(method);
  expect(calls[0].url).toBe(url);
  expect(calls[0].params).toEqual(params);
  if (body !== undefined) expect(JSON.parse(calls[0].data)).toEqual(body);
});
