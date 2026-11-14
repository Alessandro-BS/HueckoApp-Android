import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { act, renderHook, waitFor } from '@testing-library/react-native';
import * as Notifications from 'expo-notifications';
import type { ReactNode } from 'react';

import { navigationRef } from '../../navigation/navigationRef';
import * as proposalEvents from '../proposalEvents';
import { useNotificationNavigation } from '../useNotificationNavigation';

jest.mock('../../context/AuthContext', () => ({ useAuth: () => ({ status: mockStatus }) }));
jest.mock('../../navigation/navigationRef', () => ({
  navigationRef: { isReady: jest.fn(), navigate: jest.fn() },
}));

let mockStatus = 'signedIn';
const mockedRef = jest.mocked(navigationRef) as unknown as { isReady: jest.Mock; navigate: jest.Mock };
const N = jest.mocked(Notifications);

const data = (over: Record<string, unknown> = {}) => ({ kind: 'NEW_PROPOSAL', proposalId: 'p1', groupId: 'g1', screen: 'VOTING', ...over });
const response = (d: unknown, actionIdentifier = 'expo.modules.notifications.actions.DEFAULT') =>
  ({ actionIdentifier, notification: { request: { content: { data: d } } } }) as never;

let responseListener: (r: never) => void;
let receivedListener: (n: never) => void;
const removeResponse = jest.fn();
const removeReceived = jest.fn();

async function setup() {
  const client = new QueryClient();
  const invalidate = jest.spyOn(client, 'invalidateQueries');
  const wrapper = ({ children }: { children: ReactNode }) => <QueryClientProvider client={client}>{children}</QueryClientProvider>;
  const hook = await renderHook(() => useNotificationNavigation(), { wrapper });
  return { hook, invalidate };
}

beforeEach(() => {
  jest.clearAllMocks();
  mockStatus = 'signedIn';
  mockedRef.isReady.mockReturnValue(true);
  N.getLastNotificationResponseAsync.mockResolvedValue(null);
  N.addNotificationResponseReceivedListener.mockImplementation(((l: never) => {
    responseListener = l;
    return { remove: removeResponse };
  }) as never);
  N.addNotificationReceivedListener.mockImplementation(((l: never) => {
    receivedListener = l;
    return { remove: removeReceived };
  }) as never);
});

describe('useNotificationNavigation', () => {
  it('configura cómo se muestran los avisos con la app abierta', async () => {
    await setup();
    expect(N.setNotificationHandler).toHaveBeenCalled();
    const handler = N.setNotificationHandler.mock.calls[0][0]!;
    await expect(handler.handleNotification({} as never)).resolves.toEqual({
      shouldShowBanner: true,
      shouldShowList: true,
      shouldPlaySound: true,
      shouldSetBadge: false,
    });
  });

  it('tocar un NEW_PROPOSAL abre Votar con su proposalId', async () => {
    await setup();
    await act(async () => responseListener(response(data())));
    expect(mockedRef.navigate).toHaveBeenCalledWith('Voting', { proposalId: 'p1' });
  });

  it('tocar un aviso de plan abre el detalle del plan', async () => {
    await setup();
    await act(async () => responseListener(response(data({ kind: 'PLAN_CONFIRMED', screen: 'PLAN' }))));
    expect(mockedRef.navigate).toHaveBeenCalledWith('PlanDetail', { proposalId: 'p1' });
  });

  it('ignora acciones que no son el toque normal', async () => {
    await setup();
    await act(async () => responseListener(response(data(), 'dismiss')));
    expect(mockedRef.navigate).not.toHaveBeenCalled();
  });

  it('datos inválidos no navegan', async () => {
    await setup();
    await act(async () => responseListener(response({ foo: 1 })));
    await act(async () => responseListener(response(data({ screen: 'OTRA' }))));
    await act(async () => responseListener(response(data({ proposalId: '' }))));
    await act(async () => responseListener(response(data({ kind: 'PLAN_CONFIRMED', screen: 'VOTING' }))));
    expect(mockedRef.navigate).not.toHaveBeenCalled();
  });

  it('con la app cerrada, navega al aviso inicial cuando la navegación está lista', async () => {
    mockedRef.isReady.mockReturnValue(false);
    N.getLastNotificationResponseAsync.mockResolvedValue(response(data({ kind: 'PLAN_CANCELLED', screen: 'PLAN' })));
    jest.useFakeTimers();
    try {
      await setup();
      await act(async () => {
        await Promise.resolve();
      });
      expect(mockedRef.navigate).not.toHaveBeenCalled();
      mockedRef.isReady.mockReturnValue(true);
      await act(async () => {
        jest.advanceTimersByTime(500);
      });
      expect(mockedRef.navigate).toHaveBeenCalledTimes(1);
      expect(mockedRef.navigate).toHaveBeenCalledWith('PlanDetail', { proposalId: 'p1' });
      await act(async () => {
        jest.advanceTimersByTime(2000);
      });
      expect(mockedRef.navigate).toHaveBeenCalledTimes(1);
    } finally {
      jest.useRealTimers();
    }
  });

  it('sin sesión guarda el destino y navega al iniciar sesión', async () => {
    mockStatus = 'signedOut';
    jest.useFakeTimers();
    try {
      const { hook } = await setup();
      await act(async () => responseListener(response(data())));
      expect(mockedRef.navigate).not.toHaveBeenCalled();
      mockStatus = 'signedIn';
      await hook.rerender({});
      await act(async () => {
        jest.advanceTimersByTime(500);
      });
      expect(mockedRef.navigate).toHaveBeenCalledTimes(1);
      expect(mockedRef.navigate).toHaveBeenCalledWith('Voting', { proposalId: 'p1' });
    } finally {
      jest.useRealTimers();
    }
  });

  it('recibir con la app abierta invalida Inicio y los grupos', async () => {
    const { invalidate } = await setup();
    await act(async () => receivedListener({ request: { content: { data: data() } } } as never));
    expect(invalidate).toHaveBeenCalledWith({ queryKey: ['dashboard'] });
    expect(invalidate).toHaveBeenCalledWith({ queryKey: ['groups'] });
  });

  it('recibir un aviso válido emite el cambio de su propuesta; uno inválido no', async () => {
    const emit = jest.spyOn(proposalEvents, 'emitProposalChanged');
    await setup();
    await act(async () => receivedListener({ request: { content: { data: data({ proposalId: 'p9' }) } } } as never));
    expect(emit).toHaveBeenCalledWith('p9');
    emit.mockClear();
    await act(async () => receivedListener({ request: { content: { data: { foo: 1 } } } } as never));
    expect(emit).not.toHaveBeenCalled();
  });

  it('desmontar quita las suscripciones', async () => {
    const { hook } = await setup();
    await waitFor(() => expect(N.getLastNotificationResponseAsync).toHaveBeenCalled());
    await hook.unmount();
    expect(removeResponse).toHaveBeenCalled();
    expect(removeReceived).toHaveBeenCalled();
  });
});
