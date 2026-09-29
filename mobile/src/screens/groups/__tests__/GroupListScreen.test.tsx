import type { Group, GroupSummary } from '@hueckoapp/shared';
import { fireEvent, render, screen, waitFor } from '@testing-library/react-native';

import { ApiError } from '../../../api/client';
import * as groupsApi from '../../../api/groups';
import { showToast } from '../../../utils/toast';
import { GroupListScreen } from '../GroupListScreen';

jest.mock('../../../api/groups');
jest.mock('../../../utils/toast', () => ({ showToast: jest.fn() }));
jest.mock('../../../hooks/useRefreshOnFocus', () => ({ useRefreshOnFocus: jest.fn() }));

const mocked = groupsApi as jest.Mocked<typeof groupsApi>;
const navigation = { navigate: jest.fn() } as any;
const summary: GroupSummary = { id: 'g1', name: 'Proyecto Integrador', description: '', memberCount: 1, availabilityThreshold: 80 };
const group = (over: Partial<Group>): Group => ({ ...summary, inviteCode: 'PROY2026', members: [], ...over });
const renderScreen = () => render(<GroupListScreen navigation={navigation} route={{} as any} />);

beforeEach(() => jest.clearAllMocks());

it('sin grupos muestra el estado vacío', async () => {
  mocked.listGroups.mockResolvedValue([]);
  await renderScreen();
  expect(await screen.findByText('Aún no tienes ningún grupo')).toBeTruthy();
  expect(screen.getByText('Crea uno para invitar a tus compañeros, o únete con el código que te hayan pasado.')).toBeTruthy();
});

it('si la carga falla sin datos muestra el error y Reintentar vuelve a pedir', async () => {
  mocked.listGroups.mockRejectedValueOnce(new ApiError(500, 'INTERNAL', 'Algo falló.'));
  mocked.listGroups.mockResolvedValueOnce([summary]);
  await renderScreen();
  expect(await screen.findByText('Algo falló.')).toBeTruthy();
  await fireEvent.press(screen.getByText('Reintentar'));
  expect(await screen.findByText('Proyecto Integrador')).toBeTruthy();
});

it('muestra una tarjeta por grupo y abre su detalle', async () => {
  mocked.listGroups.mockResolvedValue([
    summary,
    { id: 'g2', name: 'Amigos', description: 'Los de siempre', memberCount: 3, availabilityThreshold: 80 },
  ]);
  await renderScreen();
  expect(await screen.findByText('Proyecto Integrador')).toBeTruthy();
  expect(screen.getByText('1 miembro')).toBeTruthy();
  expect(screen.getByText('3 miembros')).toBeTruthy();
  expect(screen.getByText('Los de siempre')).toBeTruthy();
  await fireEvent.press(screen.getByText('Amigos'));
  expect(navigation.navigate).toHaveBeenCalledWith('GroupDetail', { groupId: 'g2', name: 'Amigos' });
});

it('crea un grupo desde el diálogo y lo añade a la lista', async () => {
  mocked.listGroups.mockResolvedValue([]);
  mocked.createGroup.mockResolvedValue(group({ id: 'g9', name: 'Estudio' }));
  await renderScreen();
  await fireEvent.press(await screen.findByText('Crear grupo'));
  expect(screen.getByText('Crear Nuevo Grupo')).toBeTruthy();

  // Con el nombre vacío, enviar desde el teclado solo lo frena el guard del diálogo (no el botón deshabilitado).
  await fireEvent(screen.getByLabelText('Nombre del grupo'), 'submitEditing');
  expect(mocked.createGroup).not.toHaveBeenCalled();

  await fireEvent.changeText(screen.getByLabelText('Nombre del grupo'), '  Estudio ');
  // Control positivo: la misma vía sí crea cuando hay nombre.
  await fireEvent(screen.getByLabelText('Nombre del grupo'), 'submitEditing');
  await waitFor(() => expect(screen.queryByText('Crear Nuevo Grupo')).toBeNull());
  expect(mocked.createGroup).toHaveBeenCalledWith({ name: 'Estudio' });
  expect(screen.getByText('Estudio')).toBeTruthy();
  expect(showToast).toHaveBeenCalledWith('Grupo «Estudio» creado.');
});

it('crear con el botón «Crear» también funciona', async () => {
  mocked.listGroups.mockResolvedValue([]);
  mocked.createGroup.mockResolvedValue(group({ id: 'g9', name: 'Estudio' }));
  await renderScreen();
  await fireEvent.press(await screen.findByText('Crear grupo'));
  await fireEvent.changeText(screen.getByLabelText('Nombre del grupo'), 'Estudio');
  await fireEvent.press(screen.getByText('Crear'));
  await waitFor(() => expect(mocked.createGroup).toHaveBeenCalledWith({ name: 'Estudio' }));
});

it('unirse: fuerza mayúsculas, muestra el error y lo olvida al cerrar el diálogo', async () => {
  mocked.listGroups.mockResolvedValue([]);
  mocked.joinGroup.mockRejectedValueOnce(new ApiError(404, 'INVALID_INVITE_CODE', 'Código de invitación inválido.'));
  await renderScreen();
  await fireEvent.press(await screen.findByText('Unirme'));
  expect(screen.getByText('Unirse a un Grupo')).toBeTruthy();

  await fireEvent.changeText(screen.getByLabelText('Código de Invitación'), 'proy2026');
  expect(screen.getByLabelText('Código de Invitación').props.value).toBe('PROY2026');
  await fireEvent.press(screen.getByText('Unirse'));
  expect(await screen.findByText('Código de invitación inválido.')).toBeTruthy();
  expect(mocked.joinGroup).toHaveBeenCalledWith('PROY2026');

  await fireEvent.press(screen.getByText('Cancelar'));
  await fireEvent.press(screen.getByText('Unirme'));
  expect(screen.queryByText('Código de invitación inválido.')).toBeNull();
  expect(screen.getByLabelText('Código de Invitación').props.value).toBe('');
});

it('unirse con éxito añade el grupo y avisa', async () => {
  mocked.listGroups.mockResolvedValue([]);
  mocked.joinGroup.mockResolvedValue(group({ id: 'g2', name: 'Amigos de la Uni', memberCount: 2 }));
  await renderScreen();
  await fireEvent.press(await screen.findByText('Unirme'));
  await fireEvent.changeText(screen.getByLabelText('Código de Invitación'), 'HUECKO123');
  await fireEvent.press(screen.getByText('Unirse'));
  expect(await screen.findByText('Amigos de la Uni')).toBeTruthy();
  expect(showToast).toHaveBeenCalledWith('Te uniste a «Amigos de la Uni».');
});
