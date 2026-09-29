import type { TimeBlockInput } from '@hueckoapp/shared';
import type { AxiosAdapter, InternalAxiosRequestConfig } from 'axios';

import { api } from '../client';
import * as groups from '../groups';
import * as schedule from '../schedule';

const original = api.defaults.adapter;
let calls: InternalAxiosRequestConfig[] = [];

// Adaptador falso que responde 200 y guarda la petición para inspeccionarla.
const recorder: AxiosAdapter = async (config) => {
  calls.push(config);
  return { data: [], status: 200, statusText: '', headers: {}, config };
};

beforeEach(() => {
  calls = [];
  api.defaults.adapter = recorder;
});
afterAll(() => {
  api.defaults.adapter = original;
});

const block: TimeBlockInput = {
  label: 'Clase', type: 'CLASE', startTime: '08:00', endTime: '10:00', isRecurring: true, dayOfWeek: 1, date: null,
};

// [método, url, llamada, cuerpo esperado]: el título de cada test se lee como "GET /groups".
it.each<[string, string, () => Promise<unknown>, unknown]>([
  ['GET', '/me/time-blocks', () => schedule.listTimeBlocks(), undefined],
  ['POST', '/me/time-blocks', () => schedule.createTimeBlock(block), block],
  ['DELETE', '/me/time-blocks/b%201', () => schedule.deleteTimeBlock('b 1'), undefined],
  ['GET', '/groups', () => groups.listGroups(), undefined],
  ['GET', '/groups/g1', () => groups.getGroup('g1'), undefined],
  ['POST', '/groups', () => groups.createGroup({ name: 'Estudio' }), { name: 'Estudio' }],
  ['POST', '/groups/join', () => groups.joinGroup(' proy2026 '), { inviteCode: 'PROY2026' }],
  ['PATCH', '/groups/g1/members/u2', () => groups.setMemberEssential('g1', 'u2', true), { isEssential: true }],
  ['DELETE', '/groups/g1/members/me', () => groups.leaveGroup('g1'), undefined],
  ['GET', '/groups/g1/availability', () => groups.getAvailability('g1'), undefined],
])('%s %s', async (method, url, call, body) => {
  await call();
  expect(calls).toHaveLength(1);
  expect(calls[0].method?.toUpperCase()).toBe(method);
  expect(calls[0].url).toBe(url);
  if (body !== undefined) expect(JSON.parse(calls[0].data)).toEqual(body);
});
