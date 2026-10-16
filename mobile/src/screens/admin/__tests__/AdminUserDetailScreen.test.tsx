import { act, fireEvent, render, screen, waitFor } from '@testing-library/react-native';
import { Alert } from 'react-native';

import * as adminApi from '../../../api/admin';
import { ApiError } from '../../../api/client';
import { ADMIN_USER, makeUserDetail } from '../../../testing/adminFixtures';
import { TEST_USER } from '../../../testing/fixtures';
import { showToast } from '../../../utils/toast';
import { AdminUserDetailScreen } from '../AdminUserDetailScreen';

jest.mock('../../../api/admin');
jest.mock('../../../utils/toast', () => ({ showToast: jest.fn() }));
const mockUseAuth = jest.fn();
jest.mock('../../../context/AuthContext', () => ({ useAuth: () => mockUseAuth() }));
const mocked = adminApi as jest.Mocked<typeof adminApi>;

const navigation = { setOptions: jest.fn(), goBack: jest.fn() } as any;
const renderScreen = (userId = 'u2') =>
  render(<AdminUserDetailScreen navigation={navigation} route={{ key: 'k', name: 'AdminUserDetail', params: { userId, name: 'Ana' } } as any} />);

beforeEach(() => {
  jest.clearAllMocks();
  mockUseAuth.mockReturnValue({ user: { ...ADMIN_USER, role: 'ADMIN' } });
  mocked.getAdminUser.mockResolvedValue(makeUserDetail());
});

it('muestra la cuenta, su actividad y sus grupos', async () => {
  await renderScreen();
  expect(await screen.findByText('ana@test.com')).toBeTruthy();
  expect(screen.getByText('Usuario')).toBeTruthy();
  expect(screen.getByText('Activa')).toBeTruthy();
  expect(screen.getByLabelText('Votos: 2')).toBeTruthy();
  expect(screen.getByLabelText('Llamadas a la IA: 4')).toBeTruthy();
  expect(screen.getByText('Proyecto Integrador · Miembro')).toBeTruthy();
  expect(navigation.setOptions).toHaveBeenCalledWith({ title: 'Ana' });
});

it('suspender pide confirmación, suspende y avisa', async () => {
  const alert = jest.spyOn(Alert, 'alert').mockImplementation(() => {});
  mocked.setUserStatus.mockResolvedValue(makeUserDetail({ status: 'SUSPENDED' }));
  await renderScreen();
  await fireEvent.press(await screen.findByText('Suspender cuenta'));
  expect(alert).toHaveBeenCalledWith(
    'Suspender cuenta',
    'Ana no podrá entrar ni usar la app hasta que la reactives. Sus grupos y planes no se borran.',
    expect.any(Array),
  );
  expect(mocked.setUserStatus).not.toHaveBeenCalled();
  const buttons = alert.mock.calls[0][2]!;
  await act(async () => buttons[1].onPress!());
  await waitFor(() => expect(showToast).toHaveBeenCalledWith('Cuenta suspendida.'));
  expect(mocked.setUserStatus).toHaveBeenCalledWith('u2', 'SUSPENDED');
  expect(screen.getByText('Reactivar cuenta')).toBeTruthy();
});

it('nombrar administrador pide confirmación y, al confirmar, cambia el rol y avisa', async () => {
  const alert = jest.spyOn(Alert, 'alert').mockImplementation(() => {});
  mocked.setUserRole.mockResolvedValue(makeUserDetail({ role: 'ADMIN' }));
  await renderScreen();
  await fireEvent.press(await screen.findByText('Nombrar administrador'));
  expect(alert).toHaveBeenCalledWith(
    'Nombrar administrador',
    'Ana podrá ver las estadísticas, suspender cuentas y borrar grupos.',
    expect.any(Array),
  );
  expect(mocked.setUserRole).not.toHaveBeenCalled(); // nada sin confirmar
  await act(async () => alert.mock.calls[0][2]![1].onPress!());
  await waitFor(() => expect(showToast).toHaveBeenCalledWith('Ana ahora es administrador.'));
  expect(mocked.setUserRole).toHaveBeenCalledWith('u2', 'ADMIN');
  expect(screen.getByText('Quitar rol de administrador')).toBeTruthy();
});

it('un 409 del servidor se muestra y no avisa de éxito', async () => {
  const alert = jest.spyOn(Alert, 'alert').mockImplementation(() => {});
  mocked.getAdminUser.mockResolvedValue(makeUserDetail({ role: 'ADMIN' }));
  mocked.setUserRole.mockRejectedValue(new ApiError(409, 'LAST_ADMIN', 'Tiene que quedar al menos un administrador activo.'));
  await renderScreen();
  await fireEvent.press(await screen.findByText('Quitar rol de administrador'));
  await act(async () => alert.mock.calls[0][2]![1].onPress!());
  expect(await screen.findByText('Tiene que quedar al menos un administrador activo.')).toBeTruthy();
  expect(showToast).not.toHaveBeenCalled();
});

it('en la propia cuenta no hay botones de estado ni de rol; en la de otra admin, sí', async () => {
  mocked.getAdminUser.mockResolvedValue(makeUserDetail({ ...ADMIN_USER, role: 'ADMIN' }));
  const first = await renderScreen(ADMIN_USER.id);
  expect(await screen.findByText('Es tu cuenta: no puedes suspenderla ni quitarte el rol de administrador.')).toBeTruthy();
  expect(screen.queryByText('Suspender cuenta')).toBeNull();
  expect(screen.queryByText('Quitar rol de administrador')).toBeNull();
  await first.unmount();
  // Control positivo: la misma cuenta vista por otra admin sí tiene las acciones.
  mockUseAuth.mockReturnValue({ user: { ...TEST_USER, role: 'ADMIN' } });
  await renderScreen(ADMIN_USER.id);
  expect(await screen.findByText('Quitar rol de administrador')).toBeTruthy();
  expect(screen.getByText('Suspender cuenta')).toBeTruthy();
});

it('una cuenta que ya no existe (404 USER_NOT_FOUND) muestra el mensaje y no las acciones', async () => {
  mocked.getAdminUser.mockRejectedValue(new ApiError(404, 'USER_NOT_FOUND', 'Usuario no encontrado.'));
  await renderScreen();
  expect(await screen.findByText('Usuario no encontrado.')).toBeTruthy();
  expect(screen.queryByText('Suspender cuenta')).toBeNull();
});

it('dos acciones que fallan seguidas: el banner muestra el mensaje de la última', async () => {
  const alert = jest.spyOn(Alert, 'alert').mockImplementation(() => {});
  mocked.setUserStatus.mockRejectedValue(new ApiError(409, 'CANNOT_CHANGE_SELF', 'No puedes cambiar tu propia cuenta.'));
  mocked.setUserRole.mockRejectedValue(new ApiError(409, 'LAST_ADMIN', 'Tiene que quedar al menos un administrador activo.'));
  await renderScreen();
  await fireEvent.press(await screen.findByText('Suspender cuenta'));
  await act(async () => alert.mock.calls[0][2]![1].onPress!());
  expect(await screen.findByText('No puedes cambiar tu propia cuenta.')).toBeTruthy();
  await fireEvent.press(screen.getByText('Nombrar administrador'));
  await act(async () => alert.mock.calls[1][2]![1].onPress!());
  expect(await screen.findByText('Tiene que quedar al menos un administrador activo.')).toBeTruthy();
  expect(screen.queryByText('No puedes cambiar tu propia cuenta.')).toBeNull();
});
