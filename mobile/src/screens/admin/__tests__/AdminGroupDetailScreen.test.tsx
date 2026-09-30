import { act, fireEvent, render, screen, waitFor } from '@testing-library/react-native';
import { Alert } from 'react-native';

import * as adminApi from '../../../api/admin';
import { ApiError } from '../../../api/client';
import { makeAdminProposal, makeGroupDetail } from '../../../testing/adminFixtures';
import { showToast } from '../../../utils/toast';
import { AdminGroupDetailScreen } from '../AdminGroupDetailScreen';

jest.mock('../../../api/admin');
jest.mock('../../../utils/toast', () => ({ showToast: jest.fn() }));
const mocked = adminApi as jest.Mocked<typeof adminApi>;

const navigation = { setOptions: jest.fn(), goBack: jest.fn() } as any;
const renderScreen = () =>
  render(
    <AdminGroupDetailScreen navigation={navigation} route={{ key: 'k', name: 'AdminGroupDetail', params: { groupId: 'g1', name: 'Proyecto Integrador' } } as any} />,
  );

beforeEach(() => {
  jest.clearAllMocks();
  mocked.getAdminGroup.mockResolvedValue(makeGroupDetail());
});

it('muestra el grupo, sus miembros y sus propuestas', async () => {
  await renderScreen();
  expect(await screen.findByText('Código PROY2026 · 2 miembros · umbral 80 %')).toBeTruthy();
  expect(screen.getByText('Administra: Usuario de Prueba')).toBeTruthy();
  expect(screen.getByText('Imprescindible')).toBeTruthy();
  expect(screen.getByText('Repaso antes de la entrega')).toBeTruthy();
  expect(screen.getByText('En votación')).toBeTruthy();
  expect(screen.getByText('Ana · 1 voto · 0 incidencias')).toBeTruthy();
});

it('cancelar exige un motivo de 3 a 200 caracteres (recortado) y luego marca la propuesta como cancelada', async () => {
  mocked.cancelProposalAsAdmin.mockResolvedValue(makeAdminProposal({ state: 'CANCELADO' }));
  await renderScreen();
  await fireEvent.press(await screen.findByText('Cancelar propuesta'));
  expect(screen.getByText('«Repaso antes de la entrega» pasará a «Cancelado» para todo el grupo. Quedará en el registro de acciones.')).toBeTruthy();
  const confirmButton = () => screen.getByLabelText('Sí, cancelar');
  // Sin motivo, en blanco o de 2 caracteres tras el trim: el botón está desactivado y no se llama a la API.
  expect(confirmButton()).toBeDisabled();
  await fireEvent.changeText(screen.getByLabelText('Motivo'), '     ');
  expect(confirmButton()).toBeDisabled();
  await fireEvent.changeText(screen.getByLabelText('Motivo'), '  ab ');
  expect(confirmButton()).toBeDisabled();
  await fireEvent.press(screen.getByText('Sí, cancelar'));
  expect(mocked.cancelProposalAsAdmin).not.toHaveBeenCalled();
  // Control positivo: con 3 caracteres se activa.
  await fireEvent.changeText(screen.getByLabelText('Motivo'), '  Spam ');
  expect(confirmButton()).toBeEnabled();
  await fireEvent.press(screen.getByText('Sí, cancelar'));
  await waitFor(() => expect(showToast).toHaveBeenCalledWith('Propuesta cancelada.'));
  expect(mocked.cancelProposalAsAdmin).toHaveBeenCalledWith('prop_2', 'Spam');
  expect(screen.getByText('Cancelado')).toBeTruthy();
  expect(screen.queryByText('Cancelar propuesta')).toBeNull();
});

it('si cancelar falla, el error se queda en el diálogo y no avisa', async () => {
  mocked.cancelProposalAsAdmin.mockRejectedValue(new ApiError(409, 'INVALID_STATE', 'La propuesta ya está cancelada.'));
  await renderScreen();
  await fireEvent.press(await screen.findByText('Cancelar propuesta'));
  await fireEvent.changeText(screen.getByLabelText('Motivo'), 'Spam');
  await fireEvent.press(screen.getByText('Sí, cancelar'));
  expect(await screen.findByText('La propuesta ya está cancelada.')).toBeTruthy();
  expect(mocked.cancelProposalAsAdmin).toHaveBeenCalledWith('prop_2', 'Spam');
  expect(showToast).not.toHaveBeenCalled();
});

it('un grupo que ya no existe (404 GROUP_NOT_FOUND) muestra el mensaje y no las acciones', async () => {
  mocked.getAdminGroup.mockRejectedValue(new ApiError(404, 'GROUP_NOT_FOUND', 'Grupo no encontrado.'));
  await renderScreen();
  expect(await screen.findByText('Grupo no encontrado.')).toBeTruthy();
  expect(screen.queryByText('Eliminar grupo')).toBeNull();
});

it('eliminar pide confirmación, borra, avisa y vuelve atrás', async () => {
  const alert = jest.spyOn(Alert, 'alert').mockImplementation(() => {});
  mocked.deleteAdminGroup.mockResolvedValue(undefined);
  await renderScreen();
  await fireEvent.press(await screen.findByText('Eliminar grupo'));
  expect(alert).toHaveBeenCalledWith(
    'Eliminar grupo',
    'Se borrará «Proyecto Integrador» con 2 miembros y 1 propuesta. No se puede deshacer.',
    expect.any(Array),
  );
  expect(mocked.deleteAdminGroup).not.toHaveBeenCalled();
  await act(async () => alert.mock.calls[0][2]![1].onPress!());
  await waitFor(() => expect(navigation.goBack).toHaveBeenCalled());
  expect(mocked.deleteAdminGroup).toHaveBeenCalledWith('g1');
  expect(showToast).toHaveBeenCalledWith('Grupo «Proyecto Integrador» eliminado.');
});
