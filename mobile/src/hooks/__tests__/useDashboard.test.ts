import type { TimeBlock } from '@hueckoapp/shared';
import { act, renderHook, waitFor } from '@testing-library/react-native';

import { ApiError } from '../../api/client';
import * as dashboardApi from '../../api/dashboard';
import * as proposalsApi from '../../api/proposals';
import * as scheduleApi from '../../api/schedule';
import { makeDashboard, makeProposal } from '../../testing/fixtures';
import { useDashboard } from '../useDashboard';

jest.mock('../../api/dashboard');
jest.mock('../../api/proposals');
jest.mock('../../api/schedule');
const dashboard = dashboardApi as jest.Mocked<typeof dashboardApi>;
const proposals = proposalsApi as jest.Mocked<typeof proposalsApi>;
const schedule = scheduleApi as jest.Mocked<typeof scheduleApi>;

const block: TimeBlock = {
  id: 'b1', userId: 'u1', label: 'Clase de Android', type: 'CLASE', startTime: '08:00', endTime: '10:00',
  isRecurring: true, dayOfWeek: 1, date: null,
};

beforeEach(() => {
  jest.clearAllMocks();
  dashboard.getDashboard.mockResolvedValue(makeDashboard());
  schedule.listTimeBlocks.mockResolvedValue([block]);
});

const load = async () => {
  const hook = await renderHook(() => useDashboard());
  await waitFor(() => expect(hook.result.current.loaded).toBe(true));
  return hook;
};

it('carga el resumen y mis bloques en una sola carga', async () => {
  const { result } = await load();
  expect(result.current.dashboard).toEqual(makeDashboard());
  expect(result.current.blocks).toEqual([block]);
});

it('toggleVote vota y actualiza solo esa votación, conservando el nombre del grupo', async () => {
  proposals.voteWindow.mockResolvedValue(makeProposal({ myVoteWindowId: 'w_22' }));
  const { result } = await load();
  let outcome;
  await act(async () => {
    outcome = await result.current.toggleVote('prop_2', 'w_22');
  });
  expect(outcome).toEqual({ ok: true, value: 'voted' });
  expect(proposals.voteWindow).toHaveBeenCalledWith('prop_2', 'w_22');
  expect(result.current.dashboard?.pendingVotes[0]).toMatchObject({ id: 'prop_2', myVoteWindowId: 'w_22', groupName: 'Proyecto Integrador' });
});

it('toggleVote sobre mi franja retira el voto', async () => {
  dashboard.getDashboard.mockResolvedValue(
    makeDashboard({ pendingVotes: [{ ...makeProposal({ myVoteWindowId: 'w_21' }), groupName: 'Proyecto Integrador' }] }),
  );
  proposals.removeVote.mockResolvedValue(makeProposal());
  const { result } = await load();
  let outcome;
  await act(async () => {
    outcome = await result.current.toggleVote('prop_2', 'w_21');
  });
  expect(outcome).toEqual({ ok: true, value: 'unvoted' });
  expect(proposals.removeVote).toHaveBeenCalledWith('prop_2');
  expect(result.current.dashboard?.pendingVotes[0].myVoteWindowId).toBeNull();
});

it('si el voto falla, no lanza: expone voteError y el resumen no cambia', async () => {
  proposals.voteWindow.mockRejectedValue(new ApiError(409, 'VOTING_CLOSED', 'La votación ya cerró.'));
  const { result } = await load();
  let outcome;
  await act(async () => {
    outcome = await result.current.toggleVote('prop_2', 'w_22');
  });
  expect(outcome).toEqual({ ok: false });
  expect(result.current.voteError).toBe('La votación ya cerró.');
  expect(result.current.dashboard).toEqual(makeDashboard());
});

it('si falla una de las dos cargas queda el error', async () => {
  dashboard.getDashboard.mockRejectedValue(new ApiError(0, 'NETWORK_ERROR', 'No se pudo conectar con el servidor. Revisa tu conexión.'));
  const { result } = await renderHook(() => useDashboard());
  await waitFor(() => expect(result.current.error).toBe('No se pudo conectar con el servidor. Revisa tu conexión.'));
  expect(result.current.loaded).toBe(false);
});
