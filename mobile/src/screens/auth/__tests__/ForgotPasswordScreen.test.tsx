import { fireEvent, render, screen, waitFor } from '@testing-library/react-native';

import * as authApi from '../../../api/auth';
import { ApiError } from '../../../api/client';
import { ForgotPasswordScreen } from '../ForgotPasswordScreen';

jest.mock('../../../api/auth');
const mocked = authApi as jest.Mocked<typeof authApi>;
const navigation = { goBack: jest.fn(), navigate: jest.fn() } as any;
const challenge = { id: 'c1', purpose: 'RESET_PASSWORD' as const, emailHint: 'a***@correo.com', resendAvailableAt: '2026-01-01T00:01:00.000Z' };
const renderScreen = (email?: string) =>
  render(<ForgotPasswordScreen navigation={navigation} route={{ params: { email } } as any} />);

beforeEach(() => jest.clearAllMocks());

it('valida el correo', async () => {
  await renderScreen();
  await fireEvent.press(screen.getByText('Enviar código'));
  expect(screen.getByText('El correo es requerido')).toBeTruthy();
  expect(mocked.forgotPasswordRequest).not.toHaveBeenCalled();
});

it('rellena el correo recibido, pide el código y navega a VerifyCode', async () => {
  mocked.forgotPasswordRequest.mockResolvedValue({ challenge });
  await renderScreen('ana@correo.com');
  expect(screen.getByPlaceholderText('tucorreo@ejemplo.com').props.value).toBe('ana@correo.com');
  await fireEvent.press(screen.getByText('Enviar código'));
  await waitFor(() => expect(mocked.forgotPasswordRequest).toHaveBeenCalledWith('ana@correo.com'));
  await waitFor(() => expect(navigation.navigate).toHaveBeenCalledWith('VerifyCode', { challenge }));
});

it('muestra el error del servidor', async () => {
  mocked.forgotPasswordRequest.mockRejectedValue(new ApiError(0, 'NETWORK_ERROR', 'No se pudo conectar con el servidor. Revisa tu conexión.'));
  await renderScreen('ana@correo.com');
  await fireEvent.press(screen.getByText('Enviar código'));
  expect(await screen.findByText('No se pudo conectar con el servidor. Revisa tu conexión.')).toBeTruthy();
});
