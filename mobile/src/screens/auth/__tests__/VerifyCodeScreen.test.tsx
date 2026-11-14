import { act, fireEvent, render, screen, waitFor } from '@testing-library/react-native';

import * as authApi from '../../../api/auth';
import { ApiError } from '../../../api/client';
import { showToast } from '../../../utils/toast';
import { VerifyCodeScreen } from '../VerifyCodeScreen';

const mockComplete = jest.fn();
jest.mock('../../../context/AuthContext', () => ({ useAuth: () => ({ completeChallenge: mockComplete }) }));
jest.mock('../../../api/auth');
jest.mock('../../../utils/toast', () => ({ showToast: jest.fn() }));
const mocked = authApi as jest.Mocked<typeof authApi>;

const NOW = new Date('2026-01-01T00:00:00.000Z');
const challenge = (over: object = {}) => ({
  id: 'c1',
  purpose: 'LOGIN_2FA' as const,
  emailHint: 'a***@correo.com',
  resendAvailableAt: new Date(NOW.getTime() + 60_000).toISOString(),
  ...over,
});
const navigation = { goBack: jest.fn() } as any;
const renderScreen = (c = challenge()) =>
  render(<VerifyCodeScreen navigation={navigation} route={{ params: { challenge: c } } as any} />);
const typeCode = (code: string) => fireEvent.changeText(screen.getByLabelText('Código de 6 dígitos'), code);

beforeEach(() => {
  jest.clearAllMocks();
  jest.useFakeTimers({ now: NOW });
});
afterEach(() => {
  jest.useRealTimers();
});

it('muestra el título y el correo, y no envía solo al completar 6 dígitos', async () => {
  await renderScreen();
  expect(screen.getByText('Escribe el código')).toBeTruthy();
  expect(screen.getByText('Te enviamos un código a a***@correo.com')).toBeTruthy();
  await typeCode('123456');
  expect(mockComplete).not.toHaveBeenCalled();
});

it('Verificar llama con el reto y el código', async () => {
  mockComplete.mockResolvedValue(undefined);
  await renderScreen();
  await typeCode('123456');
  await fireEvent.press(screen.getByText('Verificar'));
  await waitFor(() => expect(mockComplete).toHaveBeenCalledWith('c1', '123456', undefined));
});

it('con menos de 6 dígitos no envía', async () => {
  await renderScreen();
  await typeCode('123');
  await fireEvent.press(screen.getByText('Verificar'));
  expect(mockComplete).not.toHaveBeenCalled();
});

it('CODE_INVALID muestra el mensaje del servidor y vacía el campo', async () => {
  mockComplete.mockRejectedValue(new ApiError(400, 'CODE_INVALID', 'Código incorrecto. Te quedan 4 intentos.', { attemptsLeft: 4 }));
  await renderScreen();
  await typeCode('123456');
  await fireEvent.press(screen.getByText('Verificar'));
  expect(await screen.findByText('Código incorrecto. Te quedan 4 intentos.')).toBeTruthy();
  expect(screen.getByLabelText('Código de 6 dígitos').props.value).toBe('');
});

it('CHALLENGE_EXPIRED muestra el mensaje y «Volver»', async () => {
  mockComplete.mockRejectedValue(new ApiError(410, 'CHALLENGE_EXPIRED', 'Pide un código nuevo.'));
  await renderScreen();
  await typeCode('123456');
  await fireEvent.press(screen.getByText('Verificar'));
  expect(await screen.findByText('Pide un código nuevo.')).toBeTruthy();
  await fireEvent.press(screen.getByText('Volver'));
  expect(navigation.goBack).toHaveBeenCalled();
});

it('reenviar está deshabilitado hasta que la cuenta atrás llega a 0', async () => {
  mocked.resendChallengeRequest.mockResolvedValue(undefined);
  await renderScreen();
  expect(screen.getByText('Reenviar en 60 s')).toBeTruthy();
  await fireEvent.press(screen.getByText('Reenviar en 60 s'));
  expect(mocked.resendChallengeRequest).not.toHaveBeenCalled();
  await act(async () => {
    jest.advanceTimersByTime(30_000);
  });
  expect(screen.getByText('Reenviar en 30 s')).toBeTruthy();
  await act(async () => {
    jest.advanceTimersByTime(30_000);
  });
  await fireEvent.press(screen.getByText('Reenviar código'));
  await waitFor(() => expect(mocked.resendChallengeRequest).toHaveBeenCalledWith('c1'));
  await waitFor(() => expect(showToast).toHaveBeenCalledWith('Te enviamos un código nuevo.'));
  expect(screen.getByText(/Reenviar en \d+ s/)).toBeTruthy();
});

it('RESEND_TOO_SOON reinicia la cuenta atrás con retryAfterSeconds', async () => {
  mocked.resendChallengeRequest.mockRejectedValue(new ApiError(429, 'RESEND_TOO_SOON', 'Espera un momento.', { retryAfterSeconds: 42 }));
  await renderScreen(challenge({ resendAvailableAt: NOW.toISOString() }));
  await fireEvent.press(screen.getByText('Reenviar código'));
  expect(await screen.findByText('Reenviar en 42 s')).toBeTruthy();
});

describe('RESET_PASSWORD', () => {
  const reset = () => challenge({ purpose: 'RESET_PASSWORD' });

  it('exige que las contraseñas coincidan', async () => {
    await renderScreen(reset());
    await typeCode('123456');
    await fireEvent.changeText(screen.getByPlaceholderText('Al menos 8 caracteres'), 'contrasena-nueva');
    await fireEvent.changeText(screen.getByPlaceholderText('Repite la contraseña'), 'otra-distinta');
    await fireEvent.press(screen.getByText('Verificar'));
    expect(screen.getByText('Las contraseñas no coinciden')).toBeTruthy();
    expect(mockComplete).not.toHaveBeenCalled();
  });

  it('valida la contraseña nueva', async () => {
    await renderScreen(reset());
    await typeCode('123456');
    await fireEvent.press(screen.getByText('Verificar'));
    expect(screen.getByText('La contraseña es requerida')).toBeTruthy();
    expect(mockComplete).not.toHaveBeenCalled();
  });

  it('manda la contraseña nueva con el código', async () => {
    mockComplete.mockResolvedValue(undefined);
    await renderScreen(reset());
    await typeCode('123456');
    await fireEvent.changeText(screen.getByPlaceholderText('Al menos 8 caracteres'), 'contrasena-nueva');
    await fireEvent.changeText(screen.getByPlaceholderText('Repite la contraseña'), 'contrasena-nueva');
    await fireEvent.press(screen.getByText('Verificar'));
    await waitFor(() => expect(mockComplete).toHaveBeenCalledWith('c1', '123456', 'contrasena-nueva'));
  });
});
