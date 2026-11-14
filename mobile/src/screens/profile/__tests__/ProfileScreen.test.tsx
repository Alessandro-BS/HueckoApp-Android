import AsyncStorage from '@react-native-async-storage/async-storage';
import { act, fireEvent, render, screen, waitFor } from '@testing-library/react-native';
import Constants from 'expo-constants';
import * as Notifications from 'expo-notifications';
import { AppState, Linking } from 'react-native';

import { notificationsPreference } from '../../../storage/appStorage';
import * as registration from '../../../notifications/registration';
import { ProfileScreen } from '../ProfileScreen';

jest.mock('../../../notifications/registration', () => ({
  ...jest.requireActual('../../../notifications/registration'),
  registerDevice: jest.fn(async () => 'registered'),
  unregisterDevice: jest.fn(async () => undefined),
}));
jest.mock('../../../context/AuthContext', () => ({
  useAuth: () => ({ user: { id: 'u1', name: 'Ana', email: 'ana@correo.com', role: 'USER' }, logout: jest.fn() }),
}));
const reg = registration as jest.Mocked<typeof registration>;
const constants = Constants as unknown as { executionEnvironment: string };

jest.setTimeout(15_000); // el primer render del archivo transforma muchos módulos

beforeEach(async () => {
  jest.clearAllMocks();
  constants.executionEnvironment = 'standalone';
  await AsyncStorage.clear();
  jest.mocked(Notifications.getPermissionsAsync).mockResolvedValue({ status: 'granted', granted: true } as never);
});

it('encender el interruptor guarda la preferencia y registra el celular', async () => {
  await notificationsPreference.set(false);
  await render(<ProfileScreen />);
  const toggle = await screen.findByLabelText('Notificaciones en este celular');
  await waitFor(() => expect(toggle.props.value).toBe(false));
  await fireEvent(toggle, 'valueChange', true);
  await waitFor(() => expect(reg.registerDevice).toHaveBeenCalledTimes(1));
  expect(await notificationsPreference.get()).toBe(true);
  expect(screen.getByLabelText('Notificaciones en este celular').props.value).toBe(true);
});

it('si el permiso está denegado, explica, ofrece abrir los ajustes y vuelve a apagar', async () => {
  await notificationsPreference.set(false);
  reg.registerDevice.mockResolvedValueOnce('denied');
  const open = jest.spyOn(Linking, 'openSettings').mockResolvedValue(undefined);
  await render(<ProfileScreen />);
  const toggle = await screen.findByLabelText('Notificaciones en este celular');
  await fireEvent(toggle, 'valueChange', true);
  expect(await screen.findByText('Activa las notificaciones de HueckoApp en los ajustes del teléfono')).toBeTruthy();
  expect(screen.getByLabelText('Notificaciones en este celular').props.value).toBe(false);
  expect(await notificationsPreference.get()).toBe(false);
  await fireEvent.press(screen.getByText('Abrir ajustes'));
  expect(open).toHaveBeenCalled();
});

it('apagar guarda la preferencia y desregistra el celular', async () => {
  await render(<ProfileScreen />);
  const toggle = await screen.findByLabelText('Notificaciones en este celular');
  await waitFor(() => expect(toggle.props.value).toBe(true));
  await fireEvent(toggle, 'valueChange', false);
  await waitFor(() => expect(reg.unregisterDevice).toHaveBeenCalledTimes(1));
  expect(await notificationsPreference.get()).toBe(false);
});

it('en Expo Go el interruptor está deshabilitado y lo explica', async () => {
  constants.executionEnvironment = 'storeClient';
  await render(<ProfileScreen />);
  expect(await screen.findByText('Disponible en la app instalada (APK)')).toBeTruthy();
  expect(screen.getByLabelText('Notificaciones en este celular').props.disabled).toBe(true);
});

it('si el permiso del teléfono no está concedido, el interruptor sale apagado aunque la preferencia sea true', async () => {
  jest.mocked(Notifications.getPermissionsAsync).mockResolvedValue({ status: 'denied', granted: false } as never);
  await render(<ProfileScreen />);
  expect(await screen.findByText('Activa las notificaciones de HueckoApp en los ajustes del teléfono')).toBeTruthy();
  expect(screen.getByLabelText('Notificaciones en este celular').props.value).toBe(false);
  expect(screen.getByText('Abrir ajustes')).toBeTruthy();
});

it('al volver a primer plano revisa de nuevo el permiso (p. ej. tras activarlo en los ajustes)', async () => {
  let onChange: (state: string) => void = () => undefined;
  jest.spyOn(AppState, 'addEventListener').mockImplementation(((_: string, l: (s: string) => void) => {
    onChange = l;
    return { remove: jest.fn() };
  }) as never);
  jest.mocked(Notifications.getPermissionsAsync).mockResolvedValue({ status: 'denied', granted: false } as never);
  await render(<ProfileScreen />);
  expect(await screen.findByText('Abrir ajustes')).toBeTruthy();
  jest.mocked(Notifications.getPermissionsAsync).mockResolvedValue({ status: 'granted', granted: true } as never);
  await act(async () => {
    onChange('background');
  });
  await act(async () => {
    onChange('active');
  });
  await waitFor(() => expect(screen.queryByText('Abrir ajustes')).toBeNull());
  expect(screen.getByLabelText('Notificaciones en este celular').props.value).toBe(true);
});
