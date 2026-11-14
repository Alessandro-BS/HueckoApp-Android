import AsyncStorage from '@react-native-async-storage/async-storage';
import Constants from 'expo-constants';
import * as Notifications from 'expo-notifications';

import * as notificationsApi from '../../api/notifications';
import { notificationsPreference, pushTokenStorage } from '../../storage/appStorage';
import { registerDevice, unregisterDevice } from '../registration';

jest.mock('../../api/notifications');
const api = notificationsApi as jest.Mocked<typeof notificationsApi>;
const constants = Constants as unknown as { executionEnvironment: string };

beforeEach(async () => {
  jest.clearAllMocks();
  constants.executionEnvironment = 'standalone';
  await AsyncStorage.clear();
  jest.mocked(Notifications.getPermissionsAsync).mockResolvedValue({ status: 'granted', granted: true } as never);
});

it('con permiso crea el canal antes de pedirlo, guarda el token y lo envía', async () => {
  jest.mocked(Notifications.getPermissionsAsync).mockResolvedValue({ status: 'undetermined', granted: false } as never);
  jest.mocked(Notifications.requestPermissionsAsync).mockResolvedValue({ status: 'granted', granted: true } as never);
  await expect(registerDevice()).resolves.toBe('registered');
  expect(Notifications.setNotificationChannelAsync).toHaveBeenCalledWith('planes', { name: 'Planes', importance: 4 });
  expect(jest.mocked(Notifications.setNotificationChannelAsync).mock.invocationCallOrder[0]).toBeLessThan(
    jest.mocked(Notifications.requestPermissionsAsync).mock.invocationCallOrder[0],
  );
  expect(Notifications.getExpoPushTokenAsync).toHaveBeenCalledWith({ projectId: 'proj-1' });
  expect(api.registerPushDevice).toHaveBeenCalledWith('ExponentPushToken[abc]');
  expect(await pushTokenStorage.get()).toBe('ExponentPushToken[abc]');
});

it('con el permiso ya concedido no lo vuelve a pedir', async () => {
  await registerDevice();
  expect(Notifications.requestPermissionsAsync).not.toHaveBeenCalled();
});

it('permiso denegado: devuelve denied y no envía nada', async () => {
  jest.mocked(Notifications.getPermissionsAsync).mockResolvedValue({ status: 'denied', granted: false } as never);
  jest.mocked(Notifications.requestPermissionsAsync).mockResolvedValue({ status: 'denied', granted: false } as never);
  await expect(registerDevice()).resolves.toBe('denied');
  expect(api.registerPushDevice).not.toHaveBeenCalled();
  expect(await pushTokenStorage.get()).toBeNull();
});

it('en Expo Go devuelve unavailable sin pedir nada', async () => {
  constants.executionEnvironment = 'storeClient';
  await expect(registerDevice()).resolves.toBe('unavailable');
  expect(Notifications.setNotificationChannelAsync).not.toHaveBeenCalled();
  expect(Notifications.getPermissionsAsync).not.toHaveBeenCalled();
  expect(api.registerPushDevice).not.toHaveBeenCalled();
});

it('un error de red devuelve unavailable sin lanzar', async () => {
  api.registerPushDevice.mockRejectedValue(new Error('sin red'));
  await expect(registerDevice()).resolves.toBe('unavailable');
  jest.mocked(Notifications.getExpoPushTokenAsync).mockRejectedValueOnce(new Error('sin Google Play'));
  await expect(registerDevice()).resolves.toBe('unavailable');
});

it('unregisterDevice borra en el servidor y olvida el token; sin token no llama', async () => {
  await unregisterDevice();
  expect(api.unregisterPushDevice).not.toHaveBeenCalled();
  await pushTokenStorage.set('ExponentPushToken[abc]');
  await unregisterDevice();
  expect(api.unregisterPushDevice).toHaveBeenCalledWith('ExponentPushToken[abc]');
  expect(await pushTokenStorage.get()).toBeNull();
});

it('unregisterDevice ignora los errores del servidor y igual olvida el token', async () => {
  await pushTokenStorage.set('ExponentPushToken[abc]');
  api.unregisterPushDevice.mockRejectedValue(new Error('401'));
  await expect(unregisterDevice()).resolves.toBeUndefined();
  expect(await pushTokenStorage.get()).toBeNull();
});

it('la preferencia es true por defecto y se guarda', async () => {
  expect(await notificationsPreference.get()).toBe(true);
  await notificationsPreference.set(false);
  expect(await notificationsPreference.get()).toBe(false);
});
