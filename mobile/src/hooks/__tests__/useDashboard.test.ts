import type { TimeBlock } from '@hueckoapp/shared';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { act, renderHook, waitFor } from '@testing-library/react-native';

import { ApiError } from '../../api/client';
import * as dashboardApi from '../../api/dashboard';
import * as proposalsApi from '../../api/proposals';
import * as scheduleApi from '../../api/schedule';
import { dashboardCache } from '../../storage/appStorage';
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

beforeEach(async () => {
  jest.clearAllMocks();
  await AsyncStorage.clear();
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

describe('copia local en AsyncStorage (con userId)', () => {
  const saved = { dashboard: makeDashboard({ metrics: { activeGroups: 9, openVotes: 0, matchingHours: 0, totalBlocks: 0 } }), blocks: [] };
  const offline = () => new ApiError(0, 'NETWORK_ERROR', 'No se pudo conectar con el servidor. Revisa tu conexión.');

  it('cada carga buena se guarda para ese usuario', async () => {
    const { result } = await renderHook(() => useDashboard('u1'));
    await waitFor(() => expect(result.current.loaded).toBe(true));
    await waitFor(async () => expect(await dashboardCache.get('u1')).toEqual({ dashboard: makeDashboard(), blocks: [block] }));
    expect(result.current.stale).toBe(false);
  });

  it('sin red muestra la última copia, marcada como desactualizada y sin poder votar', async () => {
    await dashboardCache.set('u1', saved);
    dashboard.getDashboard.mockRejectedValue(offline());
    const { result } = await renderHook(() => useDashboard('u1'));
    await waitFor(() => expect(result.current.error).not.toBeNull());
    await waitFor(() => expect(result.current.stale).toBe(true));
    expect(result.current.loaded).toBe(true);
    expect(result.current.dashboard?.metrics.activeGroups).toBe(9);
    expect(result.current.voting).toBe(true);
  });

  it('cuando llega la respuesta del servidor reemplaza a la copia', async () => {
    await dashboardCache.set('u1', saved);
    const { result } = await renderHook(() => useDashboard('u1'));
    await waitFor(() => expect(result.current.dashboard).toEqual(makeDashboard()));
    expect(result.current.stale).toBe(false);
    await waitFor(async () => expect((await dashboardCache.get('u1'))?.dashboard).toEqual(makeDashboard()));
  });

  it('no muestra la copia de otro usuario', async () => {
    await dashboardCache.set('u2', saved);
    dashboard.getDashboard.mockRejectedValue(offline());
    const { result } = await renderHook(() => useDashboard('u1'));
    await waitFor(() => expect(result.current.error).not.toBeNull());
    expect(result.current.loaded).toBe(false);
  });
});
