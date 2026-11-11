import type { ProximityRequest } from '@hueckoapp/shared';
import { act, fireEvent, render, screen } from '@testing-library/react-native';
import { Vibration } from 'react-native';

import { pingServer } from '../../../api/proximity';
import { useProximitySession } from '../../../hooks/useProximitySession';
import { useProximityTrigger } from '../../../hooks/useProximityTrigger';
import { withQueryClient } from '../../../testing/queryClient';
import { ProximityInviteScreen } from '../ProximityInviteScreen';

jest.mock('../../../api/proximity', () => ({ pingServer: jest.fn() }));
jest.mock('../../../hooks/useProximitySession');
jest.mock('../../../hooks/useProximityTrigger');

const session = { send: jest.fn(), accept: jest.fn(), reject: jest.fn(), reset: jest.fn() };
const navigation = { goBack: jest.fn() } as any;
const route = { key: 'k', name: 'ProximityInvite', params: { groupId: 'g1', name: 'Estudio' } } as any;
const NOW = new Date('2026-11-10T12:00:00.000Z').getTime();
const request = (over: Partial<ProximityRequest>): ProximityRequest => ({
  id: 'r1', role: 'INVITE', status: 'MATCHED', group: { id: 'g1', name: 'Estudio' }, peer: { id: 'u2', name: 'Ana' },
  expiresAt: null, acceptableFrom: new Date(NOW + 3000).toISOString(), ...over,
});
const setSession = (over: Record<string, unknown>) =>
  jest.mocked(useProximitySession).mockReturnValue({ request: undefined, phase: 'idle', error: null, ...session, ...over } as any);
const renderScreen = () => render(<ProximityInviteScreen navigation={navigation} route={route} />, { wrapper: withQueryClient().wrapper });

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

it('preparado muestra la instrucción y «Usar el código» vuelve al detalle', async () => {
  await renderScreen();
  expect(screen.getByText('Junta los celulares pantalla con pantalla')).toBeTruthy();
  await fireEvent.press(screen.getByText('Usar el código'));
  expect(navigation.goBack).toHaveBeenCalled();
});

it('sin sensor muestra el aviso y «Usar el código»', async () => {
  jest.mocked(useProximityTrigger).mockReturnValue({ available: false, near: false, still: false });
  await renderScreen();
  expect(screen.getByText('Tu celular no tiene sensor de proximidad (o estás en Expo Go)')).toBeTruthy();
  expect(screen.getByText('Usar el código')).toBeTruthy();
});

it('el disparador llama a send y solo se habilita en estado preparado', async () => {
  await renderScreen();
  expect(useProximityTrigger).toHaveBeenLastCalledWith(true, session.send);
  setSession({ phase: 'active', request: request({ status: 'WAITING', acceptableFrom: null, peer: null }) });
  await renderScreen();
  expect(useProximityTrigger).toHaveBeenLastCalledWith(false, session.send);
  setSession({ error: 'Sin red' });
  await renderScreen();
  expect(useProximityTrigger).toHaveBeenLastCalledWith(false, session.send);
});

it('un error al enviar muestra el mensaje e «Intentar de nuevo» llama a reset', async () => {
  setSession({ error: 'Sin conexión.' });
  await renderScreen();
  expect(screen.getByText('Sin conexión.')).toBeTruthy();
  expect(screen.queryByText('Buscando…')).toBeNull();
  await fireEvent.press(screen.getByText('Intentar de nuevo'));
  expect(session.reset).toHaveBeenCalled();
});

it('MATCHED antes de acceptableFrom muestra «Confirmando…», después Aceptar/Rechazar', async () => {
  setSession({ phase: 'active', request: request({}) });
  await renderScreen();
  expect(screen.getByText(/quiere unirse a/)).toBeTruthy();
  expect(screen.getByText('Confirmando…')).toBeTruthy();
  expect(screen.queryByText('Aceptar')).toBeNull();
  await act(async () => jest.advanceTimersByTime(3000));
  expect(screen.queryByText('Confirmando…')).toBeNull();
  await fireEvent.press(screen.getByText('Aceptar'));
  expect(session.accept).toHaveBeenCalled();
  await fireEvent.press(screen.getByText('Rechazar'));
  expect(session.reject).toHaveBeenCalled();
});

it('vibra una vez al llegar acceptableFrom, y no antes', async () => {
  setSession({ phase: 'active', request: request({}) });
  const view = await renderScreen();
  await act(async () => jest.advanceTimersByTime(2999));
  expect(Vibration.vibrate).not.toHaveBeenCalled();
  await act(async () => jest.advanceTimersByTime(1));
  expect(Vibration.vibrate).toHaveBeenCalledTimes(1);
  await view.rerender(<ProximityInviteScreen navigation={navigation} route={route} />);
  await act(async () => jest.advanceTimersByTime(5000));
  expect(Vibration.vibrate).toHaveBeenCalledTimes(1);
});

it('un error de consulta con el intento activo no reemplaza el estado actual', async () => {
  setSession({ phase: 'active', error: 'Sin red', request: request({ acceptableFrom: new Date(NOW - 1).toISOString() }) });
  await renderScreen();
  expect(screen.getByText('Sin red')).toBeTruthy();
  expect(screen.getByText('Aceptar')).toBeTruthy();
  expect(screen.queryByText('Intentar de nuevo')).toBeNull();
});

it('ACCEPTED muestra que ya es parte del grupo y vuelve atrás a los 2 s', async () => {
  setSession({ phase: 'done', request: request({ status: 'ACCEPTED', acceptableFrom: null }) });
  await renderScreen();
  expect(screen.getByText('Ana ya es parte del grupo')).toBeTruthy();
  expect(navigation.goBack).not.toHaveBeenCalled();
  await act(async () => jest.advanceTimersByTime(2000));
  expect(navigation.goBack).toHaveBeenCalledTimes(1);
});

it('AMBIGUOUS muestra el texto y «Intentar de nuevo» llama a reset', async () => {
  setSession({ phase: 'done', request: request({ status: 'AMBIGUOUS', acceptableFrom: null, peer: null }) });
  await renderScreen();
  expect(screen.getByText('Hubo otro intento cerca. Repitan o usen el código')).toBeTruthy();
  await fireEvent.press(screen.getByText('Intentar de nuevo'));
  expect(session.reset).toHaveBeenCalled();
});
