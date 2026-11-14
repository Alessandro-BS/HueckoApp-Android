import { fireEvent, render, screen, waitFor } from '@testing-library/react-native';

import { RegisterScreen } from '../RegisterScreen';

const mockRegister = jest.fn();
jest.mock('../../../context/AuthContext', () => ({ useAuth: () => ({ register: mockRegister }) }));
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
