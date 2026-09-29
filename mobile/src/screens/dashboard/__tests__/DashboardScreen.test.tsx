import type { Group, TimeBlock } from '@hueckoapp/shared';
import { fireEvent, render, screen, waitFor } from '@testing-library/react-native';

import { ApiError } from '../../../api/client';
import * as dashboardApi from '../../../api/dashboard';
import * as groupsApi from '../../../api/groups';
import * as proposalsApi from '../../../api/proposals';
import * as scheduleApi from '../../../api/schedule';
import { makeDashboard, makeProposal } from '../../../testing/fixtures';
import { showToast } from '../../../utils/toast';
import { DashboardScreen } from '../DashboardScreen';

jest.mock('../../../api/dashboard');
jest.mock('../../../api/groups');
jest.mock('../../../api/proposals');
jest.mock('../../../api/schedule');
jest.mock('../../../hooks/useRefreshOnFocus', () => ({ useRefreshOnFocus: jest.fn() }));
jest.mock('../../../utils/toast', () => ({ showToast: jest.fn() }));
// Hoy es martes 29 de septiembre de 2026 a las 10:00.
jest.mock('../../../utils/clock', () => ({ today: () => new Date(2026, 8, 29, 10, 0) }));
jest.mock('../../../context/AuthContext', () => ({
  useAuth: () => ({ user: { id: 'u1', name: 'Usuario de Prueba', email: 'test@test.com' } }),
}));

const dashboard = dashboardApi as jest.Mocked<typeof dashboardApi>;
const groups = groupsApi as jest.Mocked<typeof groupsApi>;
const proposals = proposalsApi as jest.Mocked<typeof proposalsApi>;
const schedule = scheduleApi as jest.Mocked<typeof scheduleApi>;
const navigation = { navigate: jest.fn() } as any;

const block = (over: Partial<TimeBlock>): TimeBlock => ({
  id: 'b', userId: 'u1', label: 'Bloque', type: 'CLASE', startTime: '08:00', endTime: '10:00',
  isRecurring: true, dayOfWeek: 1, date: null, ...over,
});
// Bloques de la semilla: lunes y miércoles (hoy, martes, no hay nada).
const SEED_BLOCKS = [
  block({ id: 'b1', label: 'Clase de Android', dayOfWeek: 1 }),
  block({ id: 'b2', label: 'Trabajo Part-time', dayOfWeek: 3, startTime: '14:00', endTime: '16:00' }),
];
const renderScreen = () => render(<DashboardScreen navigation={navigation} route={{} as any} />);

beforeEach(() => {
  jest.clearAllMocks();
  dashboard.getDashboard.mockResolvedValue(makeDashboard());
  schedule.listTimeBlocks.mockResolvedValue(SEED_BLOCKS);
});

it('pinta los valores de la semilla (domain spec §2.2, UI spec §2.3)', async () => {
  await renderScreen();
  expect(await screen.findByText('Buenos días, Usuario')).toBeTruthy();
  expect(screen.getByText('Martes, 29 de septiembre')).toBeTruthy();
  expect(screen.getByText('Esto es lo que pasa hoy en tus grupos y horarios.')).toBeTruthy();
  // Alerta (G5, aviso): quien creó el plan puede decidir.
  expect(await screen.findByText('Aviso de imprevisto')).toBeTruthy();
  expect(screen.getByText('Ana reportó un imprevisto en «Reunión de avance del proyecto»')).toBeTruthy();
  expect(screen.getByText('Mantener')).toBeTruthy();
  // Métricas.
  expect(screen.getByText('Grupos activos')).toBeTruthy();
  expect(screen.getByText('Votaciones abiertas')).toBeTruthy();
  expect(screen.getByText('6 h')).toBeTruthy();
  expect(screen.getByText('Donde coincide el 80% o más')).toBeTruthy();
  expect(screen.getByText('Bloques registrados')).toBeTruthy();
  // Próximo plan confirmado (franja elegida y fecha, C2/C11).
  expect(screen.getByText('Mié 30 sep · 11:00 - 13:00')).toBeTruthy();
  expect(screen.getByText('Biblioteca central')).toBeTruthy();
  expect(screen.getByText('1 de 2 asistirán')).toBeTruthy();
  // Horario de hoy: martes sin bloques.
  expect(screen.getByText('Nada en la agenda para hoy (Mar)')).toBeTruthy();
  expect(screen.getByText('Tienes 2 bloques en la semana.')).toBeTruthy();
  // Mis grupos.
  expect(screen.getByText('2 miembros · Mié 11:00 - 13:00')).toBeTruthy();
  expect(screen.getByText('100%')).toBeTruthy();
  // Votaciones en curso.
  expect(screen.getByText('Repaso antes de la entrega')).toBeTruthy();
  expect(screen.getByText('Cierra: Mar 29 sep, 20:00')).toBeTruthy();
  expect(screen.getByText('Mar · 16:00 - 18:00')).toBeTruthy();
  expect(screen.getByText('1 voto')).toBeTruthy();
});

it('horario de hoy con sus bloques y la etiqueta de cada tipo', async () => {
  schedule.listTimeBlocks.mockResolvedValue([
    block({ id: 't1', label: 'Tutoría', dayOfWeek: 2, startTime: '11:00', endTime: '12:00' }),
    block({ id: 't2', label: 'Hueco libre', type: 'LIBRE', dayOfWeek: 2, startTime: '15:00', endTime: '16:00' }),
  ]);
  await renderScreen();
  expect(await screen.findByText('Tutoría')).toBeTruthy();
  expect(screen.getByText('11:00 - 12:00')).toBeTruthy();
  expect(screen.getByText('Ocupado')).toBeTruthy();
  expect(screen.getByText('Libre')).toBeTruthy();
});

it('sin datos muestra los estados vacíos', async () => {
  dashboard.getDashboard.mockResolvedValue(
    makeDashboard({
      metrics: { activeGroups: 0, openVotes: 0, matchingHours: 0, totalBlocks: 0 },
      nextPlan: null,
      groups: [],
      pendingVotes: [],
      expressAlert: null,
    }),
  );
  schedule.listTimeBlocks.mockResolvedValue([]);
  await renderScreen();
  expect(await screen.findByText('Sin planes confirmados')).toBeTruthy();
  expect(screen.getByText('Todavía no perteneces a ningún grupo.')).toBeTruthy();
  expect(screen.getByText('No hay votaciones activas')).toBeTruthy();
  expect(screen.getByText('0 h')).toBeTruthy();
  expect(screen.queryByText('Aviso de imprevisto')).toBeNull();
  await fireEvent.press(screen.getByText('Ir a mis grupos'));
  expect(navigation.navigate).toHaveBeenCalledWith('Groups');
});

it('votar desde «Votaciones en curso» usa la misma alternancia que Votar (G1)', async () => {
  proposals.voteWindow.mockResolvedValue(makeProposal({ myVoteWindowId: 'w_22' }));
  await renderScreen();
  await fireEvent.press(await screen.findByText('Jue · 10:00 - 12:00'));
  await waitFor(() => expect(showToast).toHaveBeenCalledWith('Tu voto ha sido registrado.'));
  expect(proposals.voteWindow).toHaveBeenCalledWith('prop_2', 'w_22');
  expect(screen.getByLabelText('Tu voto')).toBeTruthy();
});

it('«Nuevo grupo» abre ahí mismo el diálogo de crear grupo y recarga Inicio (quirk 5)', async () => {
  const created: Group = {
    id: 'g2', name: 'Estudio', description: '', memberCount: 1, availabilityThreshold: 80, inviteCode: 'ABCDEFGH', members: [],
  };
  groups.createGroup.mockResolvedValue(created);
  await renderScreen();
  await fireEvent.press(await screen.findByText('Nuevo grupo'));
  expect(screen.getByText('Crear Nuevo Grupo')).toBeTruthy();
  await fireEvent.changeText(screen.getByLabelText('Nombre del grupo'), '  Estudio ');
  await fireEvent.press(screen.getByText('Crear'));
  await waitFor(() => expect(showToast).toHaveBeenCalledWith('Grupo «Estudio» creado.'));
  expect(groups.createGroup).toHaveBeenCalledWith({ name: 'Estudio' });
  expect(navigation.navigate).not.toHaveBeenCalled();
  await waitFor(() => expect(dashboard.getDashboard).toHaveBeenCalledTimes(2));
  expect(screen.queryByText('Crear Nuevo Grupo')).toBeNull();
});

it('las tarjetas y accesos navegan a Grupos, Horario, el plan y el grupo', async () => {
  await renderScreen();
  await fireEvent.press(await screen.findByText('Grupos activos'));
  expect(navigation.navigate).toHaveBeenLastCalledWith('Groups');
  await fireEvent.press(screen.getByText('Horas coincidentes'));
  expect(navigation.navigate).toHaveBeenLastCalledWith('Schedule');
  await fireEvent.press(screen.getByText('Ver todo'));
  expect(navigation.navigate).toHaveBeenLastCalledWith('Schedule');
  await fireEvent.press(screen.getByText('Gestionar'));
  expect(navigation.navigate).toHaveBeenLastCalledWith('Groups');
  await fireEvent.press(screen.getByText('Editar horario'));
  expect(navigation.navigate).toHaveBeenLastCalledWith('Schedule');
  await fireEvent.press(screen.getByText('1 de 2 asistirán'));
  expect(navigation.navigate).toHaveBeenLastCalledWith('PlanDetail', { proposalId: 'prop_1' });
  await fireEvent.press(screen.getByText('2 miembros · Mié 11:00 - 13:00'));
  expect(navigation.navigate).toHaveBeenLastCalledWith('GroupDetail', { groupId: 'g1', name: 'Proyecto Integrador' });
});

it('«Mantener» en la alerta resuelve y recarga Inicio', async () => {
  proposals.resolveIncidences.mockResolvedValue(makeProposal());
  await renderScreen();
  await fireEvent.press(await screen.findByText('Mantener'));
  await waitFor(() => expect(dashboard.getDashboard).toHaveBeenCalledTimes(2));
  expect(proposals.resolveIncidences).toHaveBeenCalledWith('prop_1', { newState: 'CONFIRMADO' });
  expect(showToast).toHaveBeenCalledWith('Votación exprés registrada: mantener.');
});

it('si la primera carga falla muestra el error con «Reintentar»', async () => {
  dashboard.getDashboard.mockRejectedValueOnce(new ApiError(0, 'NETWORK_ERROR', 'No se pudo conectar con el servidor. Revisa tu conexión.'));
  await renderScreen();
  expect(await screen.findByText('No se pudo conectar con el servidor. Revisa tu conexión.')).toBeTruthy();
  await fireEvent.press(screen.getByText('Reintentar'));
  expect(await screen.findByText('6 h')).toBeTruthy();
});
