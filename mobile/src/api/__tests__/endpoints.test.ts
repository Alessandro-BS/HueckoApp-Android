import type { TimeBlockInput } from '@hueckoapp/shared';
import type { AxiosAdapter, InternalAxiosRequestConfig } from 'axios';

import * as ai from '../ai';
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
  ['POST', '/me/time-blocks/bulk', () => schedule.createTimeBlocksBulk([block]), { blocks: [block] }],
  ['GET', '/ai/status', () => ai.getAiStatus(), undefined],
  ['POST', '/groups/g%201/ai/proposal-draft', () => ai.draftProposal('g 1', 'Estudiar el viernes'), { text: 'Estudiar el viernes' }],
  ['POST', '/groups/g1/ai/suggestions', () => ai.suggestPlans('g1'), undefined],
  ['POST', '/proposals/p1/ai/summary', () => ai.summarizeVoting('p1'), undefined],
])('%s %s', async (method, url, call, body) => {
  await call();
  expect(calls).toHaveLength(1);
  expect(calls[0].method?.toUpperCase()).toBe(method);
  expect(calls[0].url).toBe(url);
  if (body !== undefined) expect(JSON.parse(calls[0].data)).toEqual(body);
});

it('las llamadas que usan la IA esperan hasta 45 s; el resto, lo normal', async () => {
  await ai.suggestPlans('g1');
  await ai.draftProposal('g1', 'Estudiar');
  await ai.summarizeVoting('p1');
  await ai.getAiStatus();
  expect(calls.map((c) => c.timeout)).toEqual([45_000, 45_000, 45_000, 15_000]);
});

it('POST /ai/schedule-ocr sube la foto como multipart/form-data', async () => {
  await ai.scanSchedule({ uri: 'file:///horario.jpg', mimeType: 'image/jpeg', fileName: 'horario.jpg' });
  expect(calls).toHaveLength(1);
  expect(calls[0].method?.toUpperCase()).toBe('POST');
  expect(calls[0].url).toBe('/ai/schedule-ocr');
  expect(calls[0].data).toBeInstanceOf(FormData);
  expect(String(calls[0].headers['Content-Type'])).toContain('multipart/form-data');
  expect(calls[0].timeout).toBe(45_000);
});
