import { act, renderHook, waitFor } from '@testing-library/react-native';
import * as SecureStore from 'expo-secure-store';
import { AxiosError, type InternalAxiosRequestConfig } from 'axios';
import type { ReactNode } from 'react';
import { AppState, type AppStateStatus } from 'react-native';

import * as authApi from '../../api/auth';
import { api, ApiError } from '../../api/client';
import { showToast } from '../../utils/toast';
import { AuthProvider, useAuth } from '../AuthContext';

jest.mock('../../api/auth');
jest.mock('../../utils/toast', () => ({ showToast: jest.fn() }));
const mocked = authApi as jest.Mocked<typeof authApi>;
const ana = { id: 'u1', name: 'Ana', email: 'ana@correo.com', role: 'USER' as const };
const wrapper = ({ children }: { children: ReactNode }) => <AuthProvider>{children}</AuthProvider>;

beforeEach(async () => {
  jest.clearAllMocks();
  await SecureStore.deleteItemAsync('hueckoapp.token');
});

it('sin token guardado termina en signedOut', async () => {
  const { result } = await renderHook(() => useAuth(), { wrapper });
  await waitFor(() => expect(result.current.status).toBe('signedOut'));
  expect(mocked.meRequest).not.toHaveBeenCalled();
});

it('con token válido restaura la sesión', async () => {
  await SecureStore.setItemAsync('hueckoapp.token', 'tok');
  mocked.meRequest.mockResolvedValue(ana);
  const { result } = await renderHook(() => useAuth(), { wrapper });
  await waitFor(() => expect(result.current.status).toBe('signedIn'));
  expect(result.current.user).toEqual(ana);
});

it('con token inválido lo borra y queda signedOut', async () => {
  await SecureStore.setItemAsync('hueckoapp.token', 'viejo');
  mocked.meRequest.mockRejectedValue(new ApiError(401, 'UNAUTHORIZED', 'x'));
  const { result } = await renderHook(() => useAuth(), { wrapper });
  await waitFor(() => expect(result.current.status).toBe('signedOut'));
  expect(await SecureStore.getItemAsync('hueckoapp.token')).toBeNull();
});

it('con error de red conserva el token guardado y queda signedOut', async () => {
  await SecureStore.setItemAsync('hueckoapp.token', 'tok');
  mocked.meRequest.mockRejectedValue(new ApiError(0, 'NETWORK_ERROR', 'sin red'));
  const { result } = await renderHook(() => useAuth(), { wrapper });
  await waitFor(() => expect(result.current.status).toBe('signedOut'));
  expect(await SecureStore.getItemAsync('hueckoapp.token')).toBe('tok');
});

it('login guarda el token y logout lo borra', async () => {
  mocked.loginRequest.mockResolvedValue({ token: 'nuevo', user: ana });
  const { result } = await renderHook(() => useAuth(), { wrapper });
  await waitFor(() => expect(result.current.status).toBe('signedOut'));

  await act(() => result.current.login('ana@correo.com', 'contrasena-segura'));
  expect(result.current.status).toBe('signedIn');
  expect(await SecureStore.getItemAsync('hueckoapp.token')).toBe('nuevo');

  await act(() => result.current.logout());
  expect(result.current.status).toBe('signedOut');
  expect(await SecureStore.getItemAsync('hueckoapp.token')).toBeNull();
});

it('guarda el rol que devuelve el servidor', async () => {
  mocked.loginRequest.mockResolvedValue({ token: 'nuevo', user: { ...ana, role: 'ADMIN' } });
  const { result } = await renderHook(() => useAuth(), { wrapper });
  await waitFor(() => expect(result.current.status).toBe('signedOut'));
  await act(() => result.current.login('ana@correo.com', 'contrasena-segura'));
  expect(result.current.user?.role).toBe('ADMIN');
});

it('al abrir con la cuenta suspendida: borra el token y queda signedOut', async () => {
  await SecureStore.setItemAsync('hueckoapp.token', 'tok');
  mocked.meRequest.mockRejectedValue(new ApiError(403, 'ACCOUNT_SUSPENDED', 'Tu cuenta está suspendida.'));
  const { result } = await renderHook(() => useAuth(), { wrapper });
  await waitFor(() => expect(result.current.status).toBe('signedOut'));
  expect(await SecureStore.getItemAsync('hueckoapp.token')).toBeNull();
});

it('si el servidor responde ACCOUNT_SUSPENDED en plena sesión: avisa con su mensaje y cierra sesión', async () => {
  mocked.loginRequest.mockResolvedValue({ token: 'nuevo', user: ana });
  const { result } = await renderHook(() => useAuth(), { wrapper });
  await waitFor(() => expect(result.current.status).toBe('signedOut'));
  await act(() => result.current.login('ana@correo.com', 'contrasena-segura'));
  expect(result.current.status).toBe('signedIn');

  const original = api.defaults.adapter;
  api.defaults.adapter = (config) =>
    Promise.reject(
      new AxiosError('fallo', undefined, config as InternalAxiosRequestConfig, null, {
        status: 403, statusText: '', headers: {}, config: config as InternalAxiosRequestConfig,
        data: { error: { code: 'ACCOUNT_SUSPENDED', message: 'Tu cuenta está suspendida.' } },
      }),
    );
  try {
    await act(async () => {
      await expect(api.get('/groups')).rejects.toBeInstanceOf(ApiError);
    });
  } finally {
    api.defaults.adapter = original;
  }
  await waitFor(() => expect(result.current.status).toBe('signedOut'));
  expect(showToast).toHaveBeenCalledTimes(1);
  expect(showToast).toHaveBeenCalledWith('Tu cuenta está suspendida.');
  expect(await SecureStore.getItemAsync('hueckoapp.token')).toBeNull();
});

describe('al volver la app a primer plano (A3)', () => {
  let listener: ((state: AppStateStatus) => void) | undefined;
  beforeEach(() => {
    listener = undefined;
    jest.spyOn(AppState, 'addEventListener').mockImplementation((_type, fn) => {
      listener = fn;
      return { remove: jest.fn() };
    });
  });
  afterEach(() => jest.restoreAllMocks());

  it('con sesión abierta vuelve a pedir /auth/me y actualiza el rol', async () => {
    mocked.loginRequest.mockResolvedValue({ token: 'nuevo', user: ana });
    const { result } = await renderHook(() => useAuth(), { wrapper });
    await waitFor(() => expect(result.current.status).toBe('signedOut'));
    await act(() => result.current.login('ana@correo.com', 'contrasena-segura'));
    expect(result.current.user?.role).toBe('USER');

    mocked.meRequest.mockResolvedValue({ ...ana, role: 'ADMIN' });
    await act(async () => listener?.('background'));
    expect(mocked.meRequest).not.toHaveBeenCalled();
    await act(async () => listener?.('active'));
    await waitFor(() => expect(result.current.user?.role).toBe('ADMIN'));
    expect(mocked.meRequest).toHaveBeenCalledTimes(1);
  });

  it('sin sesión no pide nada', async () => {
    const { result } = await renderHook(() => useAuth(), { wrapper });
    await waitFor(() => expect(result.current.status).toBe('signedOut'));
    expect(listener).toBeUndefined(); // sin sesión ni siquiera se suscribe a los cambios de estado de la app
    expect(AppState.addEventListener).not.toHaveBeenCalled();
    await act(async () => listener?.('active'));
    expect(mocked.meRequest).not.toHaveBeenCalled();
  });

  it('si la petición falla por red conserva la sesión y el usuario', async () => {
    mocked.loginRequest.mockResolvedValue({ token: 'nuevo', user: ana });
    const { result } = await renderHook(() => useAuth(), { wrapper });
    await waitFor(() => expect(result.current.status).toBe('signedOut'));
    await act(() => result.current.login('ana@correo.com', 'contrasena-segura'));
    mocked.meRequest.mockRejectedValue(new ApiError(0, 'NETWORK_ERROR', 'sin red'));
    await act(async () => listener?.('active'));
    await waitFor(() => expect(mocked.meRequest).toHaveBeenCalledTimes(1));
    expect(result.current.status).toBe('signedIn');
    expect(result.current.user).toEqual(ana);
  });
});
