import { fireEvent, render, screen, waitFor } from '@testing-library/react-native';

import { ApiError } from '../../../api/client';
import * as googleSignIn from '../../../auth/googleSignIn';
import { RegisterScreen } from '../RegisterScreen';

const mockRegister = jest.fn();
const mockLoginWithGoogle = jest.fn();
jest.mock('../../../auth/googleSignIn', () => ({ isGoogleSignInAvailable: jest.fn(() => true) }));
const googleAvailable = jest.mocked(googleSignIn.isGoogleSignInAvailable);
jest.mock('../../../context/AuthContext', () => ({ useAuth: () => ({ register: mockRegister, loginWithGoogle: mockLoginWithGoogle }) }));
const navigation = { goBack: jest.fn() } as any;

it('valida nombre, correo y contraseña', async () => {
  await render(<RegisterScreen navigation={navigation} route={{} as any} />);
  await fireEvent.press(screen.getByText('Registrarme'));
  expect(screen.getByText('El nombre es requerido')).toBeTruthy();
  expect(screen.getByText('El correo es requerido')).toBeTruthy();
  expect(screen.getByText('La contraseña es requerida')).toBeTruthy();
  expect(mockRegister).not.toHaveBeenCalled();
});

it('registra con datos válidos', async () => {
  mockRegister.mockResolvedValue(undefined);
  await render(<RegisterScreen navigation={navigation} route={{} as any} />);
  await fireEvent.changeText(screen.getByPlaceholderText('Ana Pérez'), 'Ana');
  await fireEvent.changeText(screen.getByPlaceholderText('tucorreo@ejemplo.com'), 'ana@correo.com');
  await fireEvent.changeText(screen.getByPlaceholderText('Al menos 8 caracteres'), 'contrasena-segura');
  await fireEvent.press(screen.getByText('Registrarme'));
  await waitFor(() => expect(mockRegister).toHaveBeenCalledWith('Ana', 'ana@correo.com', 'contrasena-segura'));
});

it('"Inicia sesión" vuelve atrás', async () => {
  await render(<RegisterScreen navigation={navigation} route={{} as any} />);
  await fireEvent.press(screen.getByText('Inicia sesión'));
  expect(navigation.goBack).toHaveBeenCalled();
});

it('si el servidor pide verificar el correo navega a VerifyCode con el reto', async () => {
  const challenge = { id: 'c1', purpose: 'VERIFY_EMAIL', emailHint: 'a***@correo.com', resendAvailableAt: '2026-01-01T00:01:00.000Z' };
  mockRegister.mockResolvedValue(challenge);
  const nav = { goBack: jest.fn(), navigate: jest.fn() } as any;
  await render(<RegisterScreen navigation={nav} route={{} as any} />);
  await fireEvent.changeText(screen.getByPlaceholderText('Ana Pérez'), 'Ana');
  await fireEvent.changeText(screen.getByPlaceholderText('tucorreo@ejemplo.com'), 'ana@correo.com');
  await fireEvent.changeText(screen.getByPlaceholderText('Al menos 8 caracteres'), 'contrasena-segura');
  await fireEvent.press(screen.getByText('Registrarme'));
  await waitFor(() => expect(nav.navigate).toHaveBeenCalledWith('VerifyCode', { challenge }));
});

describe('Continuar con Google', () => {
  beforeEach(() => {
    mockLoginWithGoogle.mockReset();
    googleAvailable.mockReturnValue(true);
  });

  it('el botón se ve solo si Google está disponible', async () => {
    await render(<RegisterScreen navigation={navigation} route={{} as any} />);
    expect(screen.getByText('Continuar con Google')).toBeTruthy();
    await screen.unmount();
    googleAvailable.mockReturnValue(false);
    await render(<RegisterScreen navigation={navigation} route={{} as any} />);
    expect(screen.queryByText('Continuar con Google')).toBeNull();
  });

  it('tocarlo llama a loginWithGoogle', async () => {
    mockLoginWithGoogle.mockResolvedValue(true);
    await render(<RegisterScreen navigation={navigation} route={{} as any} />);
    await fireEvent.press(screen.getByText('Continuar con Google'));
    await waitFor(() => expect(mockLoginWithGoogle).toHaveBeenCalledTimes(1));
  });

  it('cancelar no muestra error y un error del servidor sí', async () => {
    mockLoginWithGoogle.mockResolvedValueOnce(false);
    await render(<RegisterScreen navigation={navigation} route={{} as any} />);
    await fireEvent.press(screen.getByText('Continuar con Google'));
    await waitFor(() => expect(mockLoginWithGoogle).toHaveBeenCalledTimes(1));
    expect(screen.queryByRole('alert')).toBeNull();
    mockLoginWithGoogle.mockRejectedValueOnce(new ApiError(503, 'GOOGLE_NOT_CONFIGURED', 'Google no está configurado.'));
    await fireEvent.press(screen.getByText('Continuar con Google'));
    expect(await screen.findByText('Google no está configurado.')).toBeTruthy();
  });
});
