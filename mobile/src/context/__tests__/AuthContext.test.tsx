import { act, renderHook, waitFor } from '@testing-library/react-native';
import * as SecureStore from 'expo-secure-store';
import type { ReactNode } from 'react';

import * as authApi from '../../api/auth';
import { ApiError } from '../../api/client';
import { AuthProvider, useAuth } from '../AuthContext';

jest.mock('../../api/auth');
const mocked = authApi as jest.Mocked<typeof authApi>;
const ana = { id: 'u1', name: 'Ana', email: 'ana@correo.com' };
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
