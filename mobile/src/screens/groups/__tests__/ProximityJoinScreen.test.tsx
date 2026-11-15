import type { ProximityRequest } from '@hueckoapp/shared';
import { act, fireEvent, render, screen } from '@testing-library/react-native';
import { Vibration } from 'react-native';

import * as groupsApi from '../../../api/groups';
import { pingServer } from '../../../api/proximity';
import { useProximitySession } from '../../../hooks/useProximitySession';
import { useProximityTrigger } from '../../../hooks/useProximityTrigger';
import { queryKeys } from '../../../api/queryClient';
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
const testClient = withQueryClient();
const invalidate = jest.spyOn(testClient.client, 'invalidateQueries');
const renderScreen = () =>
  render(<ProximityJoinScreen navigation={navigation} route={{ key: 'k', name: 'ProximityJoin' } as any} />, { wrapper: testClient.wrapper });

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

it('en MATCHED muestra «Confirmando…» sin nombres hasta acceptableFrom; después espera a que el otro lo acepte', async () => {
  setSession({ phase: 'active', request: request({}) });
  await renderScreen();
  // Los primeros 3 s la pareja aún puede anularse (AMBIGUOUS): no se muestra a quién ni a qué grupo.
  expect(screen.getByText('Confirmando…')).toBeTruthy();
  expect(screen.queryByText(/Esperando a que/)).toBeNull();
  expect(screen.queryByText(/Ana|Estudio/)).toBeNull();
  await act(async () => jest.advanceTimersByTime(3000));
  expect(screen.queryByText('Confirmando…')).toBeNull();
  expect(screen.getByText(/Esperando a que/)).toBeTruthy();
  expect(screen.getByText('Ana')).toBeTruthy();
  expect(screen.getByText('Estudio')).toBeTruthy();
  expect(screen.queryByText('Aceptar')).toBeNull();
});

it('WAITING muestra «Buscando…» sin «Intentar de nuevo»', async () => {
  setSession({ phase: 'active', request: request({ status: 'WAITING', group: null, peer: null, acceptableFrom: null }) });
  await renderScreen();
  expect(screen.getByText('Buscando…')).toBeTruthy();
  expect(screen.queryByText('Intentar de nuevo')).toBeNull();
});

it.each([
  ['AMBIGUOUS', 'Hubo otro intento cerca. Repitan o usen el código'],
  ['CANCELLED', 'El intento se canceló.'],
] as const)('%s muestra su texto e «Intentar de nuevo»', async (status, text) => {
  setSession({ phase: 'done', request: request({ status, group: null, peer: null, acceptableFrom: null }) });
  await renderScreen();
  expect(screen.getByText(text)).toBeTruthy();
  await fireEvent.press(screen.getByText('Intentar de nuevo'));
  expect(session.reset).toHaveBeenCalled();
});

it('un error al enviar muestra el mensaje e «Intentar de nuevo», no «Buscando…»', async () => {
  setSession({ error: 'Sin conexión.' });
  await renderScreen();
  expect(screen.getByText('Sin conexión.')).toBeTruthy();
  expect(screen.queryByText('Buscando…')).toBeNull();
  expect(useProximityTrigger).toHaveBeenLastCalledWith(false, session.send);
  await fireEvent.press(screen.getByText('Intentar de nuevo'));
  expect(session.reset).toHaveBeenCalled();
});

it('ACCEPTED navega al detalle del grupo', async () => {
  setSession({ phase: 'done', request: request({ status: 'ACCEPTED', acceptableFrom: null }) });
  await renderScreen();
  expect(navigation.replace).toHaveBeenCalledWith('GroupDetail', { groupId: 'g1', name: 'Estudio' });
  expect(navigation.replace).toHaveBeenCalledTimes(1);
  expect(invalidate).toHaveBeenCalledWith({ queryKey: queryKeys.groups });
});

it.each(['REJECTED', 'EXPIRED'] as const)('%s muestra «No se completó» e «Intentar de nuevo»', async (status) => {
  setSession({ phase: 'done', request: request({ status, acceptableFrom: null }) });
  await renderScreen();
  expect(screen.getByText('No se completó')).toBeTruthy();
  await fireEvent.press(screen.getByText('Intentar de nuevo'));
  expect(session.reset).toHaveBeenCalled();
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
  expect(invalidate).toHaveBeenCalledWith({ queryKey: queryKeys.groups });
  expect(navigation.replace).toHaveBeenCalledWith('GroupDetail', { groupId: 'g7', name: 'Amigos' });
});

it('sin sensor muestra el aviso', async () => {
  jest.mocked(useProximityTrigger).mockReturnValue({ available: false, near: false, still: false });
  await renderScreen();
  expect(screen.getByText('Tu celular no tiene sensor de proximidad (o estás en Expo Go)')).toBeTruthy();
});
