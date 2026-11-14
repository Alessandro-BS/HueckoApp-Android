import AsyncStorage from '@react-native-async-storage/async-storage';
import { act, fireEvent, render, screen, waitFor } from '@testing-library/react-native';
import Constants from 'expo-constants';
import * as Notifications from 'expo-notifications';
import { AppState, Linking } from 'react-native';

import * as authApiModule from '../../../api/auth';
import { ApiError } from '../../../api/client';
import { showToast } from '../../../utils/toast';
import { notificationsPreference } from '../../../storage/appStorage';
import * as registration from '../../../notifications/registration';
import { ProfileScreen } from '../ProfileScreen';

jest.mock('../../../notifications/registration', () => ({
  ...jest.requireActual('../../../notifications/registration'),
  registerDevice: jest.fn(async () => 'registered'),
  unregisterDevice: jest.fn(async () => undefined),
}));
const mockRefreshUser = jest.fn(async () => undefined);
let mockUser: Record<string, unknown> = {};
jest.mock('../../../context/AuthContext', () => ({
  useAuth: () => ({ user: mockUser, logout: jest.fn(), refreshUser: mockRefreshUser }),
}));
jest.mock('../../../api/auth');
jest.mock('../../../utils/toast', () => ({ showToast: jest.fn() }));
const authApi = authApiModule as jest.Mocked<typeof authApiModule>;
const navigation = { navigate: jest.fn() } as any;
const baseUser = { id: 'u1', name: 'Ana', email: 'ana@correo.com', role: 'USER', emailVerified: true, twoFactorEnabled: false, hasPassword: true, hasGoogle: false };
const reg = registration as jest.Mocked<typeof registration>;
const constants = Constants as unknown as { executionEnvironment: string };

jest.setTimeout(15_000); // el primer render del archivo transforma muchos módulos

beforeEach(async () => {
  jest.clearAllMocks();
  mockUser = { ...baseUser };
  constants.executionEnvironment = 'standalone';
  await AsyncStorage.clear();
  jest.mocked(Notifications.getPermissionsAsync).mockResolvedValue({ status: 'granted', granted: true } as never);
});

it('encender el interruptor guarda la preferencia y registra el celular', async () => {
  await notificationsPreference.set(false);
  await render(<ProfileScreen navigation={navigation} route={{} as any} />);
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
  await render(<ProfileScreen navigation={navigation} route={{} as any} />);
  const toggle = await screen.findByLabelText('Notificaciones en este celular');
  await fireEvent(toggle, 'valueChange', true);
  expect(await screen.findByText('Activa las notificaciones de HueckoApp en los ajustes del teléfono')).toBeTruthy();
  expect(screen.getByLabelText('Notificaciones en este celular').props.value).toBe(false);
  expect(await notificationsPreference.get()).toBe(false);
  await fireEvent.press(screen.getByText('Abrir ajustes'));
  expect(open).toHaveBeenCalled();
});

it('apagar guarda la preferencia y desregistra el celular', async () => {
  await render(<ProfileScreen navigation={navigation} route={{} as any} />);
  const toggle = await screen.findByLabelText('Notificaciones en este celular');
  await waitFor(() => expect(toggle.props.value).toBe(true));
  await fireEvent(toggle, 'valueChange', false);
  await waitFor(() => expect(reg.unregisterDevice).toHaveBeenCalledTimes(1));
  expect(await notificationsPreference.get()).toBe(false);
});

it('en Expo Go el interruptor está deshabilitado y lo explica', async () => {
  constants.executionEnvironment = 'storeClient';
  await render(<ProfileScreen navigation={navigation} route={{} as any} />);
  expect(await screen.findByText('Disponible en la app instalada (APK)')).toBeTruthy();
  expect(screen.getByLabelText('Notificaciones en este celular').props.disabled).toBe(true);
});

it('si el permiso del teléfono no está concedido, el interruptor sale apagado aunque la preferencia sea true', async () => {
  jest.mocked(Notifications.getPermissionsAsync).mockResolvedValue({ status: 'denied', granted: false } as never);
  await render(<ProfileScreen navigation={navigation} route={{} as any} />);
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
  await render(<ProfileScreen navigation={navigation} route={{} as any} />);
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

async function foregroundAfterGrant(preference: boolean) {
  let onChange: (state: string) => void = () => undefined;
  jest.spyOn(AppState, 'addEventListener').mockImplementation(((_: string, l: (s: string) => void) => {
    onChange = l;
    return { remove: jest.fn() };
  }) as never);
  await notificationsPreference.set(preference);
  jest.mocked(Notifications.getPermissionsAsync).mockResolvedValue({ status: 'denied', granted: false } as never);
  await render(<ProfileScreen navigation={navigation} route={{} as any} />);
  expect(await screen.findByText('Abrir ajustes')).toBeTruthy();
  jest.mocked(Notifications.getPermissionsAsync).mockResolvedValue({ status: 'granted', granted: true } as never);
  await act(async () => {
    onChange('background');
  });
  await act(async () => {
    onChange('active');
  });
  await waitFor(() => expect(screen.queryByText('Abrir ajustes')).toBeNull());
}

it('al volver de los ajustes con el permiso concedido y la preferencia activa, registra el celular', async () => {
  await foregroundAfterGrant(true);
  await waitFor(() => expect(reg.registerDevice).toHaveBeenCalledTimes(1));
});

it('al volver de los ajustes con el permiso concedido pero la preferencia apagada, no registra el celular', async () => {
  await foregroundAfterGrant(false);
  expect(reg.registerDevice).not.toHaveBeenCalled();
});

describe('Verificación en dos pasos', () => {
  const toggle = () => screen.getByLabelText('Verificación en dos pasos');

  it('el interruptor refleja twoFactorEnabled', async () => {
    mockUser = { ...baseUser, twoFactorEnabled: true };
    await render(<ProfileScreen navigation={navigation} route={{} as any} />);
    expect(toggle().props.value).toBe(true);
    expect(toggle().props.disabled).toBe(false);
  });

  it('sin contraseña está deshabilitado y lo explica', async () => {
    mockUser = { ...baseUser, hasPassword: false, hasGoogle: true };
    await render(<ProfileScreen navigation={navigation} route={{} as any} />);
    expect(toggle().props.disabled).toBe(true);
    expect(screen.getByText('Para activarla, primero crea una contraseña con «¿Olvidaste tu contraseña?».')).toBeTruthy();
  });

  it('activar con contraseña mala muestra el error en el diálogo y no navega', async () => {
    authApi.enable2faRequest.mockRejectedValue(new ApiError(400, 'WRONG_PASSWORD', 'La contraseña es incorrecta.'));
    await render(<ProfileScreen navigation={navigation} route={{} as any} />);
    await fireEvent(toggle(), 'valueChange', true);
    await fireEvent.changeText(screen.getByLabelText('Contraseña'), 'mala-clave');
    await fireEvent.press(screen.getByLabelText('Continuar'));
    expect(await screen.findByText('La contraseña es incorrecta.')).toBeTruthy();
    expect(authApi.enable2faRequest).toHaveBeenCalledWith('mala-clave');
    expect(navigation.navigate).not.toHaveBeenCalled();
  });

  it('activar con contraseña buena navega a EnableTwoFactor con el reto', async () => {
    const challenge = { id: 'c1', purpose: 'ENABLE_2FA', emailHint: 'a***@correo.com', resendAvailableAt: '2026-01-01T00:01:00.000Z' };
    authApi.enable2faRequest.mockResolvedValue({ challenge } as never);
    await render(<ProfileScreen navigation={navigation} route={{} as any} />);
    await fireEvent(toggle(), 'valueChange', true);
    await fireEvent.changeText(screen.getByLabelText('Contraseña'), 'clave-buena');
    await fireEvent.press(screen.getByLabelText('Continuar'));
    await waitFor(() => expect(navigation.navigate).toHaveBeenCalledWith('EnableTwoFactor', { challenge }));
    expect(screen.queryByLabelText('Contraseña')).toBeNull();
  });

  it('desactivar refresca el usuario y avisa', async () => {
    mockUser = { ...baseUser, twoFactorEnabled: true };
    authApi.disable2faRequest.mockResolvedValue(undefined);
    await render(<ProfileScreen navigation={navigation} route={{} as any} />);
    await fireEvent(toggle(), 'valueChange', false);
    await fireEvent.changeText(screen.getByLabelText('Contraseña'), 'clave-buena');
    await fireEvent.press(screen.getByLabelText('Desactivar'));
    await waitFor(() => expect(mockRefreshUser).toHaveBeenCalled());
    expect(authApi.disable2faRequest).toHaveBeenCalledWith('clave-buena');
    expect(showToast).toHaveBeenCalledWith('Verificación en dos pasos desactivada.');
  });

  it('TOO_MANY_REQUESTS muestra el mensaje del servidor en el diálogo', async () => {
    authApi.enable2faRequest.mockRejectedValue(new ApiError(429, 'TOO_MANY_REQUESTS', 'Demasiados intentos. Espera un momento.'));
    await render(<ProfileScreen navigation={navigation} route={{} as any} />);
    await fireEvent(toggle(), 'valueChange', true);
    await fireEvent.changeText(screen.getByLabelText('Contraseña'), 'x-clave-larga');
    await fireEvent.press(screen.getByLabelText('Continuar'));
    expect(await screen.findByText('Demasiados intentos. Espera un momento.')).toBeTruthy();
  });

  it('TWO_FACTOR_ALREADY_ENABLED refresca el usuario y cierra el diálogo', async () => {
    authApi.enable2faRequest.mockRejectedValue(new ApiError(409, 'TWO_FACTOR_ALREADY_ENABLED', 'Ya está activa.'));
    await render(<ProfileScreen navigation={navigation} route={{} as any} />);
    await fireEvent(toggle(), 'valueChange', true);
    await fireEvent.changeText(screen.getByLabelText('Contraseña'), 'x-clave-larga');
    await fireEvent.press(screen.getByLabelText('Continuar'));
    await waitFor(() => expect(mockRefreshUser).toHaveBeenCalled());
    expect(screen.queryByLabelText('Contraseña')).toBeNull();
  });
});
