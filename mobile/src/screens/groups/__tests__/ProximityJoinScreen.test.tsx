import type { ProximityRequest } from '@hueckoapp/shared';
import { act, fireEvent, render, screen } from '@testing-library/react-native';
import { Vibration } from 'react-native';

import * as groupsApi from '../../../api/groups';
import { pingServer } from '../../../api/proximity';
import { useProximitySession } from '../../../hooks/useProximitySession';
import { useProximityTrigger } from '../../../hooks/useProximityTrigger';
import { withQueryClient } from '../../../testing/queryClient';
import { ProximityJoinScreen } from '../ProximityJoinScreen';

jest.mock('../../../api/proximity', () => ({ pingServer: jest.fn() }));
jest.mock('../../../api/groups');
jest.mock('../../../utils/toast', () => ({ showToast: jest.fn() }));
jest.mock('../../../hooks/useProximitySession');
jest.mock('../../../hooks/useProximityTrigger');

const session = { send: jest.fn(), accept: jest.fn(), reject: jest.fn(), reset: jest.fn() };
const navigation = { replace: jest.fn(), goBack: jest.fn() } as any;
const NOW = new Date('2026-11-10T12:00:00.000Z').getTime();
const request = (over: Partial<ProximityRequest>): ProximityRequest => ({
  id: 'r1', role: 'JOIN', status: 'MATCHED', group: { id: 'g1', name: 'Estudio' }, peer: { id: 'u2', name: 'Ana' },
  expiresAt: null, acceptableFrom: new Date(NOW + 3000).toISOString(), ...over,
});
const setSession = (over: Record<string, unknown>) =>
  jest.mocked(useProximitySession).mockReturnValue({ request: undefined, phase: 'idle', error: null, ...session, ...over } as any);
const renderScreen = () => render(<ProximityJoinScreen navigation={navigation} route={{ key: 'k', name: 'ProximityJoin' } as any} />, { wrapper: withQueryClient().wrapper });

beforeEach(() => {
  jest.clearAllMocks();
  jest.useFakeTimers({ now: NOW });
  jest.spyOn(Vibration, 'vibrate').mockImplementation(() => undefined);
  jest.mocked(useProximityTrigger).mockReturnValue({ available: true, near: false, still: true });
  setSession({});
});
afterEach(() => jest.useRealTimers());

it('al montar llama a pingServer', async () => {
  await renderScreen();
  expect(pingServer).toHaveBeenCalledTimes(1);
});

it('el disparador llama a send', async () => {
  await renderScreen();
  expect(useProximityTrigger).toHaveBeenLastCalledWith(true, session.send);
  expect(screen.getByText('Junta los celulares pantalla con pantalla')).toBeTruthy();
});

it('en MATCHED espera a que el otro lo acepte, sin botones de aceptar', async () => {
  setSession({ phase: 'active', request: request({}) });
  await renderScreen();
  expect(screen.getByText(/Esperando a que/)).toBeTruthy();
  expect(screen.queryByText('Aceptar')).toBeNull();
});

it('ACCEPTED navega al detalle del grupo', async () => {
  setSession({ phase: 'done', request: request({ status: 'ACCEPTED', acceptableFrom: null }) });
  await renderScreen();
  expect(navigation.replace).toHaveBeenCalledWith('GroupDetail', { groupId: 'g1', name: 'Estudio' });
});

it('«Usar el código» abre el diálogo de código y al unirse abre el grupo', async () => {
  jest.mocked(groupsApi.joinGroup).mockResolvedValue({ id: 'g7', name: 'Amigos' } as any);
  await renderScreen();
  await fireEvent.press(screen.getByText('Usar el código'));
  expect(screen.getByText('Unirse a un Grupo')).toBeTruthy();
  await fireEvent.changeText(screen.getByLabelText('Código de Invitación'), 'ABC123');
  await fireEvent.press(screen.getByText('Unirse'));
  await act(async () => undefined);
  expect(groupsApi.joinGroup).toHaveBeenCalledWith('ABC123');
  expect(navigation.replace).toHaveBeenCalledWith('GroupDetail', { groupId: 'g7', name: 'Amigos' });
});

it('sin sensor muestra el aviso', async () => {
  jest.mocked(useProximityTrigger).mockReturnValue({ available: false, near: false, still: false });
  await renderScreen();
  expect(screen.getByText('Tu celular no tiene sensor de proximidad (o estás en Expo Go)')).toBeTruthy();
});
