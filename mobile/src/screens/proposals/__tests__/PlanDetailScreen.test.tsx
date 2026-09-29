import type { User } from '@hueckoapp/shared';
import { act, fireEvent, render, screen, waitFor } from '@testing-library/react-native';
import { Alert, Linking } from 'react-native';

import * as proposalsApi from '../../../api/proposals';
import { makeConfirmed, makeProposal, TEST_USER } from '../../../testing/fixtures';
import { showToast } from '../../../utils/toast';
import { PlanDetailScreen } from '../PlanDetailScreen';

jest.mock('../../../api/proposals');
jest.mock('../../../hooks/useRefreshOnFocus', () => ({ useRefreshOnFocus: jest.fn() }));
jest.mock('../../../utils/toast', () => ({ showToast: jest.fn() }));
jest.mock('../../../utils/clock', () => ({ today: () => new Date(2026, 8, 29, 10, 0) }));
const mockAuthUser: { current: User } = { current: { id: 'u1', name: 'Usuario de Prueba', email: 'test@test.com' } };
jest.mock('../../../context/AuthContext', () => ({ useAuth: () => ({ user: mockAuthUser.current }) }));

const mocked = proposalsApi as jest.Mocked<typeof proposalsApi>;
const navigation = { navigate: jest.fn() } as any;
const renderScreen = (proposalId = 'prop_1') =>
  render(<PlanDetailScreen navigation={navigation} route={{ key: 'k', name: 'PlanDetail', params: { proposalId } } as any} />);

beforeEach(() => jest.clearAllMocks());

it('plan confirmado: datos, franja elegida, imprevistos y «Abrir en el mapa»', async () => {
  const open = jest.spyOn(Linking, 'openURL').mockResolvedValue(true);
  mocked.getProposal.mockResolvedValue(makeConfirmed({ location: { name: 'Biblioteca central', latitude: -12.07, longitude: -77.08 } }));
  await renderScreen();
  expect(await screen.findByText('Reunión de avance del proyecto')).toBeTruthy();
  expect(screen.getByText('Biblioteca central')).toBeTruthy();
  expect(screen.getByText('Creado por: Usuario de Prueba')).toBeTruthy();
  expect(screen.getByText('Fecha: Mié 30 sep · 11:00 - 13:00')).toBeTruthy();
  expect(screen.getByText('Confirmado')).toBeTruthy();
  expect(screen.getByText('Franjas horarias')).toBeTruthy();
  expect(screen.getByText('Mié · 11:00 - 13:00')).toBeTruthy();
  expect(screen.getByText('Elegida')).toBeTruthy();
  expect(screen.getByText('Ana · Imprevisto')).toBeTruthy();
  expect(screen.getByText('Media')).toBeTruthy();
  expect(screen.queryByText('Ir a votar')).toBeNull();

  await fireEvent.press(screen.getByText('Abrir en el mapa'));
  expect(open).toHaveBeenCalledWith('https://maps.google.com/?q=-12.07,-77.08');
});

it('sin coordenadas no ofrece el mapa', async () => {
  mocked.getProposal.mockResolvedValue(makeConfirmed());
  await renderScreen();
  expect(await screen.findByText('Biblioteca central')).toBeTruthy();
  expect(screen.queryByText('Abrir en el mapa')).toBeNull();
});

it('en votación: «Ir a votar» navega y quien la creó confirma eligiendo la franja (C2)', async () => {
  mocked.getProposal.mockResolvedValue(makeProposal({ createdBy: TEST_USER }));
  mocked.confirmProposal.mockResolvedValue(makeConfirmed({ id: 'prop_2' }));
  await renderScreen('prop_2');
  await fireEvent.press(await screen.findByText('Ir a votar'));
  expect(navigation.navigate).toHaveBeenCalledWith('Voting', { proposalId: 'prop_2' });

  await fireEvent.press(screen.getByText('Confirmar plan'));
  expect(screen.getByText('La más votada')).toBeTruthy();
  await fireEvent.press(screen.getByText('Jue · 10:00 - 12:00 · 0 votos'));
  await fireEvent.press(screen.getByText('Confirmar'));
  await waitFor(() => expect(showToast).toHaveBeenCalledWith('Plan confirmado.'));
  expect(mocked.confirmProposal).toHaveBeenCalledWith('prop_2', 'w_22');
  expect(screen.getByText('Confirmado')).toBeTruthy();
});

it('confirmar sin elegir franja deja que gane la más votada', async () => {
  mocked.getProposal.mockResolvedValue(makeProposal({ createdBy: TEST_USER }));
  mocked.confirmProposal.mockResolvedValue(makeConfirmed({ id: 'prop_2' }));
  await renderScreen('prop_2');
  await fireEvent.press(await screen.findByText('Confirmar plan'));
  await fireEvent.press(screen.getByText('Confirmar'));
  await waitFor(() => expect(mocked.confirmProposal).toHaveBeenCalledWith('prop_2', undefined));
});

it('quien no creó el plan no ve «Confirmar plan» ni «Cancelar plan»', async () => {
  mocked.getProposal.mockResolvedValue(makeProposal());
  await renderScreen('prop_2');
  expect(await screen.findByText('Repaso antes de la entrega')).toBeTruthy();
  expect(screen.queryByText('Confirmar plan')).toBeNull();
  expect(screen.queryByText('Cancelar plan')).toBeNull();
});

it('cancelar pide confirmación y avisa', async () => {
  const alert = jest.spyOn(Alert, 'alert').mockImplementation(() => {});
  mocked.getProposal.mockResolvedValue(makeProposal({ createdBy: TEST_USER }));
  mocked.cancelProposal.mockResolvedValue(makeProposal({ createdBy: TEST_USER, state: 'CANCELADO' }));
  await renderScreen('prop_2');
  await fireEvent.press(await screen.findByText('Cancelar plan'));
  expect(alert).toHaveBeenCalledWith(
    'Cancelar plan',
    '¿Seguro que quieres cancelar «Repaso antes de la entrega»? El grupo dejará de verlo como pendiente.',
    expect.any(Array),
  );
  const buttons = alert.mock.calls[0][2]!;
  await act(async () => buttons[1].onPress!());
  await waitFor(() => expect(showToast).toHaveBeenCalledWith('Plan cancelado.'));
  expect(mocked.cancelProposal).toHaveBeenCalledWith('prop_2');
  expect(screen.getByText('Cancelado')).toBeTruthy();
});

it('reportar una tardanza exige los minutos (guarda por el teclado y control positivo)', async () => {
  mocked.getProposal.mockResolvedValue(makeConfirmed());
  mocked.reportIncidence.mockResolvedValue(makeConfirmed());
  await renderScreen();
  await fireEvent.press(await screen.findByText('Reportar imprevisto'));
  await fireEvent.press(screen.getByText('Llegaré tarde'));
  await fireEvent.changeText(screen.getByLabelText('¿Qué pasó?'), 'Tráfico');
  await fireEvent(screen.getByLabelText('Minutos de retraso'), 'submitEditing');
  expect(mocked.reportIncidence).not.toHaveBeenCalled();

  await fireEvent.changeText(screen.getByLabelText('Minutos de retraso'), '20');
  await fireEvent(screen.getByLabelText('Minutos de retraso'), 'submitEditing');
  await waitFor(() => expect(showToast).toHaveBeenCalledWith('Imprevisto reportado.'));
  expect(mocked.reportIncidence).toHaveBeenCalledWith('prop_1', { type: 'TARDANZA', reason: 'Tráfico', delayMinutes: 20 });
});

it('quien creó el plan resuelve el aviso desde el detalle', async () => {
  const confirmed = makeConfirmed();
  mocked.getProposal.mockResolvedValue(confirmed);
  mocked.resolveIncidences.mockResolvedValue(makeConfirmed({ incidences: [{ ...confirmed.incidences[0], resolved: true }] }));
  await renderScreen();
  expect(await screen.findByText('Aviso de imprevisto')).toBeTruthy();
  await fireEvent.press(screen.getByText('Mantener'));
  await waitFor(() => expect(screen.queryByText('Aviso de imprevisto')).toBeNull());
  expect(mocked.resolveIncidences).toHaveBeenCalledWith('prop_1', { newState: 'CONFIRMADO' });
  expect(screen.getByText('Resuelto')).toBeTruthy();
});
