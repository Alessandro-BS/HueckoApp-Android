import { act, fireEvent, render, screen, waitFor } from '@testing-library/react-native';

import * as authApi from '../../../api/auth';
import { ApiError } from '../../../api/client';
import { showToast } from '../../../utils/toast';
import { EnableTwoFactorScreen } from '../EnableTwoFactorScreen';

const mockRefreshUser = jest.fn(async () => undefined);
jest.mock('../../../context/AuthContext', () => ({ useAuth: () => ({ refreshUser: mockRefreshUser }) }));
jest.mock('../../../api/auth');
jest.mock('../../../utils/toast', () => ({ showToast: jest.fn() }));
const mocked = authApi as jest.Mocked<typeof authApi>;

const NOW = new Date('2026-01-01T00:00:00.000Z');
const challenge = {
  id: 'c1',
  purpose: 'ENABLE_2FA' as const,
  emailHint: 'a***@correo.com',
  resendAvailableAt: new Date(NOW.getTime() + 60_000).toISOString(),
};
const navigation = { goBack: jest.fn() } as any;
const renderScreen = () => render(<EnableTwoFactorScreen navigation={navigation} route={{ params: { challenge } } as any} />);
const typeCode = (code: string) => fireEvent.changeText(screen.getByLabelText('Código de 6 dígitos'), code);

beforeEach(() => {
  jest.clearAllMocks();
  jest.useFakeTimers({ now: NOW });
});
afterEach(() => {
  jest.useRealTimers();
});

it('muestra el título y a dónde se envió el código', async () => {
  await renderScreen();
  expect(screen.getByText('Escribe el código')).toBeTruthy();
  expect(screen.getByText('Te enviamos un código a a***@correo.com')).toBeTruthy();
});

it('verificar (204) refresca el usuario, avisa y vuelve atrás', async () => {
  mocked.verifyChallengeRequest.mockResolvedValue(null);
  await renderScreen();
  await typeCode('123456');
  await fireEvent.press(screen.getByText('Verificar'));
  await waitFor(() => expect(navigation.goBack).toHaveBeenCalled());
  expect(mocked.verifyChallengeRequest).toHaveBeenCalledWith('c1', '123456');
  expect(mockRefreshUser).toHaveBeenCalled();
  expect(showToast).toHaveBeenCalledWith('Verificación en dos pasos activada.');
});

it('con menos de 6 dígitos no envía', async () => {
  await renderScreen();
  await typeCode('123');
  await fireEvent.press(screen.getByText('Verificar'));
  expect(mocked.verifyChallengeRequest).not.toHaveBeenCalled();
  expect(screen.getByText('Escribe los 6 dígitos del código.')).toBeTruthy();
});

it('CODE_INVALID muestra el mensaje y vacía el campo; no vuelve atrás', async () => {
  mocked.verifyChallengeRequest.mockRejectedValue(new ApiError(400, 'CODE_INVALID', 'Código incorrecto. Te quedan 4 intentos.', { attemptsLeft: 4 }));
  await renderScreen();
  await typeCode('123456');
  await fireEvent.press(screen.getByText('Verificar'));
  expect(await screen.findByText('Código incorrecto. Te quedan 4 intentos.')).toBeTruthy();
  expect(navigation.goBack).not.toHaveBeenCalled();
});

it('CHALLENGE_EXPIRED ofrece Volver', async () => {
  mocked.verifyChallengeRequest.mockRejectedValue(new ApiError(410, 'CHALLENGE_EXPIRED', 'Pide un código nuevo.'));
  await renderScreen();
  await typeCode('123456');
  await fireEvent.press(screen.getByText('Verificar'));
  expect(await screen.findByText('Pide un código nuevo.')).toBeTruthy();
  await fireEvent.press(screen.getByText('Volver'));
  expect(navigation.goBack).toHaveBeenCalled();
});

it('Reenviar código se habilita al terminar la cuenta y pide otro código', async () => {
  mocked.resendChallengeRequest.mockResolvedValue(undefined);
  await renderScreen();
  expect(screen.getByText('Reenviar en 60 s')).toBeTruthy();
  await act(async () => {
    jest.advanceTimersByTime(60_000);
  });
  await fireEvent.press(screen.getByText('Reenviar código'));
  await waitFor(() => expect(mocked.resendChallengeRequest).toHaveBeenCalledWith('c1'));
  expect(showToast).toHaveBeenCalledWith('Te enviamos un código nuevo.');
});
