import type { TimeBlockInput } from '@hueckoapp/shared';
import type { AxiosAdapter, InternalAxiosRequestConfig } from 'axios';

import { api } from '../client';
import * as dashboard from '../dashboard';
import * as groups from '../groups';
import * as proposals from '../proposals';
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

const proposalInput = { title: 'Repaso', votingDeadline: '2026-10-03T01:00:00.000Z', windows: [] };
const windowInput = { dayOfWeek: 5, startTime: '18:00', endTime: '19:30' };
const incidenceInput = { type: 'TARDANZA' as const, reason: 'Tráfico', delayMinutes: 20 };

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
  ['GET', '/groups/g1/proposals', () => proposals.listGroupProposals('g1'), undefined],
  ['POST', '/groups/g1/proposals', () => proposals.createProposal('g1', proposalInput), proposalInput],
  ['GET', '/proposals/p1', () => proposals.getProposal('p1'), undefined],
  ['PUT', '/proposals/p1/vote', () => proposals.voteWindow('p1', 'w1'), { windowId: 'w1' }],
  ['DELETE', '/proposals/p1/vote', () => proposals.removeVote('p1'), undefined],
  ['POST', '/proposals/p1/windows', () => proposals.addWindow('p1', windowInput), windowInput],
  ['POST', '/proposals/p1/confirm', () => proposals.confirmProposal('p1'), {}],
  ['POST', '/proposals/p1/confirm', () => proposals.confirmProposal('p1', 'w1'), { windowId: 'w1' }],
  ['POST', '/proposals/p1/cancel', () => proposals.cancelProposal('p1'), undefined],
  ['POST', '/proposals/p1/incidences', () => proposals.reportIncidence('p1', incidenceInput), incidenceInput],
  ['POST', '/proposals/p1/incidences/resolve', () => proposals.resolveIncidences('p1', { newState: 'CANCELADO' }), { newState: 'CANCELADO' }],
  ['GET', '/me/dashboard', () => dashboard.getDashboard(), undefined],
])('%s %s', async (method, url, call, body) => {
  await call();
  expect(calls).toHaveLength(1);
  expect(calls[0].method?.toUpperCase()).toBe(method);
  expect(calls[0].url).toBe(url);
  if (body !== undefined) expect(JSON.parse(calls[0].data)).toEqual(body);
});
