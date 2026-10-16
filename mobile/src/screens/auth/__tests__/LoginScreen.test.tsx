import AsyncStorage from '@react-native-async-storage/async-storage';
import { fireEvent, render, screen, waitFor } from '@testing-library/react-native';

import { ApiError } from '../../../api/client';
import { lastEmailStorage } from '../../../storage/appStorage';
import { LoginScreen } from '../LoginScreen';

const mockLogin = jest.fn();
jest.mock('../../../context/AuthContext', () => ({ useAuth: () => ({ login: mockLogin }) }));
const navigation = { navigate: jest.fn() } as any;

beforeEach(async () => {
  mockLogin.mockReset();
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
