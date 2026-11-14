import AsyncStorage from '@react-native-async-storage/async-storage';
import { fireEvent, render, screen, waitFor } from '@testing-library/react-native';

import { ApiError } from '../../../api/client';
import * as googleSignIn from '../../../auth/googleSignIn';
import { lastEmailStorage } from '../../../storage/appStorage';
import { LoginScreen } from '../LoginScreen';

const mockLogin = jest.fn();
const mockLoginWithGoogle = jest.fn();
jest.mock('../../../context/AuthContext', () => ({ useAuth: () => ({ login: mockLogin, loginWithGoogle: mockLoginWithGoogle }) }));
jest.mock('../../../auth/googleSignIn', () => ({ isGoogleSignInAvailable: jest.fn(() => true) }));
const googleAvailable = jest.mocked(googleSignIn.isGoogleSignInAvailable);
const navigation = { navigate: jest.fn() } as any;

beforeEach(async () => {
  mockLogin.mockReset();
  mockLoginWithGoogle.mockReset();
  googleAvailable.mockReturnValue(true);
  await AsyncStorage.clear();
});

it('valida los campos antes de llamar al servidor', async () => {
  await render(<LoginScreen navigation={navigation} route={{} as any} />);
  await fireEvent.press(screen.getByText('Iniciar sesión'));
  expect(screen.getByText('El correo es requerido')).toBeTruthy();
  expect(screen.getByText('La contraseña es requerida')).toBeTruthy();
  expect(mockLogin).not.toHaveBeenCalled();
});

it('editar un campo borra su error', async () => {
  await render(<LoginScreen navigation={navigation} route={{} as any} />);
  await fireEvent.press(screen.getByText('Iniciar sesión'));
  await fireEvent.changeText(screen.getByPlaceholderText('tucorreo@ejemplo.com'), 'a');
  expect(screen.queryByText('El correo es requerido')).toBeNull();
});

it('muestra el error del servidor', async () => {
  mockLogin.mockRejectedValue(new ApiError(401, 'INVALID_CREDENTIALS', 'Correo o contraseña incorrectos.'));
  await render(<LoginScreen navigation={navigation} route={{} as any} />);
  await fireEvent.changeText(screen.getByPlaceholderText('tucorreo@ejemplo.com'), 'ana@correo.com');
  await fireEvent.changeText(screen.getByPlaceholderText('Al menos 8 caracteres'), 'contrasena-segura');
  await fireEvent.press(screen.getByText('Iniciar sesión'));
  await waitFor(() => expect(screen.getByText('Correo o contraseña incorrectos.')).toBeTruthy());
  expect(mockLogin).toHaveBeenCalledWith('ana@correo.com', 'contrasena-segura');
});

it('"Regístrate" navega al registro', async () => {
  await render(<LoginScreen navigation={navigation} route={{} as any} />);
  await fireEvent.press(screen.getByText('Regístrate'));
  expect(navigation.navigate).toHaveBeenCalledWith('Register');
});

it('rellena el correo de la última sesión guardado en AsyncStorage', async () => {
  await lastEmailStorage.set('ana@correo.com');
  await render(<LoginScreen navigation={navigation} route={{} as any} />);
  await waitFor(() => expect(screen.getByPlaceholderText('tucorreo@ejemplo.com').props.value).toBe('ana@correo.com'));
});

const challenge = { id: 'c1', purpose: 'LOGIN_2FA', emailHint: 'a***@correo.com', resendAvailableAt: '2026-01-01T00:01:00.000Z' };

it('si el servidor pide un código navega a VerifyCode con el reto', async () => {
  mockLogin.mockResolvedValue(challenge);
  navigation.navigate.mockClear();
  await render(<LoginScreen navigation={navigation} route={{} as any} />);
  await fireEvent.changeText(screen.getByPlaceholderText('tucorreo@ejemplo.com'), 'ana@correo.com');
  await fireEvent.changeText(screen.getByPlaceholderText('Al menos 8 caracteres'), 'contrasena-segura');
  await fireEvent.press(screen.getByText('Iniciar sesión'));
  await waitFor(() => expect(navigation.navigate).toHaveBeenCalledWith('VerifyCode', { challenge }));
});

it('"¿Olvidaste tu contraseña?" navega con el correo escrito', async () => {
  navigation.navigate.mockClear();
  await render(<LoginScreen navigation={navigation} route={{} as any} />);
  await fireEvent.changeText(screen.getByPlaceholderText('tucorreo@ejemplo.com'), ' ana@correo.com ');
  await fireEvent.press(screen.getByText('¿Olvidaste tu contraseña?'));
  expect(navigation.navigate).toHaveBeenCalledWith('ForgotPassword', { email: 'ana@correo.com' });
});

describe('Continuar con Google', () => {
  it('el botón se ve solo si Google está disponible', async () => {
    await render(<LoginScreen navigation={navigation} route={{} as any} />);
    expect(screen.getByText('Continuar con Google')).toBeTruthy();
    await screen.unmount();
    googleAvailable.mockReturnValue(false);
    await render(<LoginScreen navigation={navigation} route={{} as any} />);
    expect(screen.queryByText('Continuar con Google')).toBeNull();
  });

  it('tocarlo llama a loginWithGoogle', async () => {
    mockLoginWithGoogle.mockResolvedValue(true);
    await render(<LoginScreen navigation={navigation} route={{} as any} />);
    await fireEvent.press(screen.getByText('Continuar con Google'));
    await waitFor(() => expect(mockLoginWithGoogle).toHaveBeenCalledTimes(1));
  });

  it('cancelar no muestra ningún error', async () => {
    mockLoginWithGoogle.mockResolvedValue(false);
    await render(<LoginScreen navigation={navigation} route={{} as any} />);
    await fireEvent.press(screen.getByText('Continuar con Google'));
    await waitFor(() => expect(mockLoginWithGoogle).toHaveBeenCalled());
    expect(screen.queryByRole('alert')).toBeNull();
  });

  it('un error del servidor (409) se muestra en el banner', async () => {
    mockLoginWithGoogle.mockRejectedValue(new ApiError(409, 'GOOGLE_ACCOUNT_MISMATCH', 'Ese correo ya está vinculado a otra cuenta de Google.'));
    await render(<LoginScreen navigation={navigation} route={{} as any} />);
    await fireEvent.press(screen.getByText('Continuar con Google'));
    expect(await screen.findByText('Ese correo ya está vinculado a otra cuenta de Google.')).toBeTruthy();
  });
});
