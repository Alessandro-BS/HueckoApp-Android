import type { ProximityRequest, ProximityStatus } from '@hueckoapp/shared';
import { QueryClientProvider } from '@tanstack/react-query';
import { act, renderHook } from '@testing-library/react-native';
import { createElement, type ReactNode } from 'react';

import { ApiError } from '../../api/client';
import * as proximityApi from '../../api/proximity';
import { createQueryClient } from '../../api/queryClient';
import { withQueryClient } from '../../testing/queryClient';
import { useProximitySession } from '../useProximitySession';

jest.mock('../../api/proximity');
const mocked = proximityApi as jest.Mocked<typeof proximityApi>;

const req = (status: ProximityStatus): ProximityRequest => ({
  id: 'r1', role: 'INVITE', status, group: { id: 'g1', name: 'Equipo' }, peer: null, expiresAt: null, acceptableFrom: null,
});

const invite = { role: 'INVITE', groupId: 'g1' } as const;
const tick = (ms: number) => act(async () => { await jest.advanceTimersByTimeAsync(ms); });

beforeEach(() => {
  jest.useFakeTimers();
  jest.clearAllMocks();
  mocked.cancelProximity.mockResolvedValue(undefined);
});
afterEach(() => jest.useRealTimers());

describe('useProximitySession', () => {
  it('send crea el intento y consulta cada 1,5 s hasta un estado final', async () => {
    mocked.sendInvite.mockResolvedValue(req('WAITING'));
    mocked.getProximity.mockResolvedValueOnce(req('MATCHED')).mockResolvedValue(req('ACCEPTED'));
    const { result } = await renderHook(() => useProximitySession(invite), withQueryClient());
    expect(result.current.phase).toBe('idle');
    await act(async () => result.current.send());
    expect(mocked.sendInvite).toHaveBeenCalledWith('g1');
    expect(result.current.phase).toBe('active');
    expect(result.current.request?.status).toBe('WAITING');
    await tick(1500);
    expect(result.current.request?.status).toBe('MATCHED');
    expect(result.current.phase).toBe('active');
    await tick(1500);
    expect(result.current.request?.status).toBe('ACCEPTED');
    expect(result.current.phase).toBe('done');
    const calls = mocked.getProximity.mock.calls.length;
    await tick(3000);
    expect(mocked.getProximity).toHaveBeenCalledTimes(calls);
  });

  it('un JOIN usa sendJoin', async () => {
    mocked.sendJoin.mockResolvedValue({ ...req('WAITING'), role: 'JOIN' });
    const { result } = await renderHook(() => useProximitySession({ role: 'JOIN' }), withQueryClient());
    await act(async () => result.current.send());
    expect(mocked.sendJoin).toHaveBeenCalledTimes(1);
    expect(mocked.sendInvite).not.toHaveBeenCalled();
  });

  it('send dos veces seguidas crea un solo intento', async () => {
    mocked.sendInvite.mockResolvedValue(req('WAITING'));
    mocked.getProximity.mockResolvedValue(req('WAITING'));
    const { result } = await renderHook(() => useProximitySession(invite), withQueryClient());
    await act(async () => {
      result.current.send();
      result.current.send();
    });
    await act(async () => result.current.send());
    expect(mocked.sendInvite).toHaveBeenCalledTimes(1);
  });

  it('un error al enviar deja phase=idle con el mensaje', async () => {
    mocked.sendInvite.mockRejectedValue(new ApiError(0, 'NETWORK_ERROR', 'Sin conexión.', null));
    const { result } = await renderHook(() => useProximitySession(invite), withQueryClient());
    await act(async () => result.current.send());
    expect(result.current.phase).toBe('idle');
    expect(result.current.error).toBe('Sin conexión.');
    mocked.sendInvite.mockResolvedValue(req('WAITING'));
    await act(async () => result.current.send());
    expect(result.current.error).toBeNull();
    expect(result.current.phase).toBe('active');
  });

  it('al desmontar en WAITING llama a cancelProximity(id)', async () => {
    mocked.sendInvite.mockResolvedValue(req('WAITING'));
    mocked.getProximity.mockResolvedValue(req('WAITING'));
    const { result, unmount } = await renderHook(() => useProximitySession(invite), withQueryClient());
    await act(async () => result.current.send());
    await unmount();
    expect(mocked.cancelProximity).toHaveBeenCalledWith('r1');
  });

  it('al desmontar con el POST en vuelo, cancela el intento que llega después', async () => {
    let resolve!: (r: ProximityRequest) => void;
    mocked.sendInvite.mockReturnValue(new Promise((r) => (resolve = r)));
    const { result, unmount } = await renderHook(() => useProximitySession(invite), withQueryClient());
    await act(async () => result.current.send());
    expect(result.current.phase).toBe('sending');
    await unmount();
    expect(mocked.cancelProximity).not.toHaveBeenCalled();
    await act(async () => resolve(req('WAITING')));
    expect(mocked.cancelProximity).toHaveBeenCalledWith('r1');
    expect(mocked.getProximity).not.toHaveBeenCalled();
  });

  it('la consulta no usa los reintentos de la app (2/4/8 s): un fallo se ve y la siguiente consulta va a los 1,5 s', async () => {
    // El QueryClient real de la app, con reintentos para las demás pantallas.
    const client = createQueryClient();
    const wrapper = ({ children }: { children: ReactNode }) => createElement(QueryClientProvider, { client }, children);
    mocked.sendInvite.mockResolvedValue(req('WAITING'));
    mocked.getProximity.mockRejectedValueOnce(new ApiError(0, 'NETWORK_ERROR', 'Sin conexión.', null)).mockResolvedValue(req('MATCHED'));
    const { result, unmount } = await renderHook(() => useProximitySession(invite), { wrapper });
    await act(async () => result.current.send());
    await tick(1500);
    expect(mocked.getProximity).toHaveBeenCalledTimes(1);
    expect(result.current.error).toBe('Sin conexión.');
    await tick(1500);
    expect(mocked.getProximity).toHaveBeenCalledTimes(2);
    expect(result.current.request?.status).toBe('MATCHED');
    expect(result.current.error).toBeNull();
    await unmount();
    client.clear();
  });

  it('al desmontar, si cancelProximity falla no hay promesa sin atender', async () => {
    mocked.sendInvite.mockResolvedValue(req('MATCHED'));
    mocked.cancelProximity.mockRejectedValue(new Error('x'));
    const { result, unmount } = await renderHook(() => useProximitySession(invite), withQueryClient());
    await act(async () => result.current.send());
    await unmount();
    await act(async () => { await jest.advanceTimersByTimeAsync(10); });
    expect(mocked.cancelProximity).toHaveBeenCalledWith('r1');
  });

  it('en ACCEPTED no llama a cancelProximity al desmontar', async () => {
    mocked.sendInvite.mockResolvedValue(req('ACCEPTED'));
    const { result, unmount } = await renderHook(() => useProximitySession(invite), withQueryClient());
    await act(async () => result.current.send());
    expect(result.current.phase).toBe('done');
    await unmount();
    expect(mocked.cancelProximity).not.toHaveBeenCalled();
  });

  it('accept llama a acceptProximity y refleja ACCEPTED', async () => {
    mocked.sendInvite.mockResolvedValue(req('MATCHED'));
    mocked.getProximity.mockResolvedValue(req('MATCHED'));
    mocked.acceptProximity.mockResolvedValue(req('ACCEPTED'));
    const { result } = await renderHook(() => useProximitySession(invite), withQueryClient());
    await act(async () => result.current.send());
    await act(async () => result.current.accept());
    expect(mocked.acceptProximity).toHaveBeenCalledWith('r1');
    expect(result.current.request?.status).toBe('ACCEPTED');
    expect(result.current.phase).toBe('done');
  });

  it('reject refleja REJECTED y un error al responder queda en error', async () => {
    mocked.sendInvite.mockResolvedValue(req('MATCHED'));
    mocked.getProximity.mockResolvedValue(req('MATCHED'));
    mocked.rejectProximity.mockResolvedValue(req('REJECTED'));
    const { result } = await renderHook(() => useProximitySession(invite), withQueryClient());
    await act(async () => result.current.send());
    await act(async () => result.current.reject());
    expect(result.current.request?.status).toBe('REJECTED');
  });

  it('aceptar antes de tiempo (409 con la pareja aún MATCHED) pide «Espera un momento…», vuelve a consultar y lo borra con la siguiente consulta', async () => {
    mocked.sendInvite.mockResolvedValue(req('MATCHED'));
    mocked.getProximity.mockResolvedValue(req('MATCHED'));
    mocked.acceptProximity.mockRejectedValue(new ApiError(409, 'PROXIMITY_NOT_PENDING', 'Esta solicitud ya no se puede responder.', null));
    const { result } = await renderHook(() => useProximitySession(invite), withQueryClient());
    await act(async () => result.current.send());
    await act(async () => result.current.accept());
    expect(result.current.error).toBe('Espera un momento…');
    expect(mocked.getProximity).toHaveBeenCalledTimes(1); // la consulta que pidió el error
    await tick(3000);
    expect(mocked.getProximity.mock.calls.length).toBeGreaterThan(1);
    expect(result.current.error).toBeNull();
  });

  it('un error al aceptar deja el mensaje en error', async () => {
    mocked.sendInvite.mockResolvedValue(req('MATCHED'));
    mocked.getProximity.mockResolvedValue(req('MATCHED'));
    mocked.acceptProximity.mockRejectedValue(new ApiError(500, 'INTERNAL', 'Algo falló.', null));
    const { result } = await renderHook(() => useProximitySession(invite), withQueryClient());
    await act(async () => result.current.send());
    await act(async () => result.current.accept());
    expect(result.current.error).toBe('Algo falló.');
    expect(result.current.phase).toBe('active');
  });

  it('reset vuelve a idle y olvida el id', async () => {
    mocked.sendInvite.mockResolvedValue(req('REJECTED'));
    const { result } = await renderHook(() => useProximitySession(invite), withQueryClient());
    await act(async () => result.current.send());
    expect(result.current.phase).toBe('done');
    await act(async () => result.current.reset());
    expect(result.current.phase).toBe('idle');
    expect(result.current.request).toBeUndefined();
    mocked.sendInvite.mockResolvedValue(req('WAITING'));
    await act(async () => result.current.send());
    expect(mocked.sendInvite).toHaveBeenCalledTimes(2);
  });
});
