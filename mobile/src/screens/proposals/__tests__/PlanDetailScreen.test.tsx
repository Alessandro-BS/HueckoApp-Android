import { act, fireEvent, render, screen, waitFor } from '@testing-library/react-native';
import { Alert, Linking } from 'react-native';

import { ApiError } from '../../../api/client';
import * as proposalsApi from '../../../api/proposals';
import { makeConfirmed, makeExpressVote, makeProposal, TEST_USER } from '../../../testing/fixtures';
import { showToast } from '../../../utils/toast';
import { PlanDetailScreen } from '../PlanDetailScreen';

jest.mock('../../../api/proposals');
jest.mock('../../../api/ai');
jest.mock('../../../hooks/useRefreshOnFocus', () => ({ useRefreshOnFocus: jest.fn() }));
jest.mock('../../../utils/toast', () => ({ showToast: jest.fn() }));
jest.mock('../../../utils/clock', () => ({ today: () => new Date(2026, 8, 29, 10, 0) }));

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
  expect(screen.getByText('Mié 30 sep · 11:00 - 13:00')).toBeTruthy();
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
  await fireEvent.press(screen.getByText('Jue 1 oct · 10:00 - 12:00 · 0 votos'));
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

it('quien no gestiona el plan no ve «Confirmar plan» ni «Cancelar plan»', async () => {
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
  await waitFor(() => expect(showToast).toHaveBeenCalledWith('Avisamos al grupo.'));
  expect(mocked.reportIncidence).toHaveBeenCalledWith('prop_1', { type: 'TARDANZA', reason: 'Tráfico', delayMinutes: 20 });
});

it('reportar una ausencia crítica muestra la votación que se abrió', async () => {
  mocked.getProposal.mockResolvedValue(makeConfirmed({ incidences: [] }));
  mocked.reportIncidence.mockResolvedValue(makeConfirmed({ expressVote: makeExpressVote({ reportedBy: TEST_USER, canVote: false }) }));
  await renderScreen();
  await fireEvent.press(await screen.findByText('Reportar imprevisto'));
  await fireEvent.changeText(screen.getByLabelText('¿Qué pasó?'), 'Me surgió un viaje familiar.');
  await fireEvent.press(screen.getByText('Reportar'));
  await waitFor(() => expect(showToast).toHaveBeenCalledWith('Se abrió una votación del grupo.'));
  expect(screen.getByText('Votación exprés')).toBeTruthy();
  expect(screen.getByText('Usuario de Prueba no podrá asistir')).toBeTruthy();
});

it('un miembro vota «Reagendar» en la votación exprés del plan', async () => {
  mocked.getProposal.mockResolvedValue(makeConfirmed({ id: 'p1', expressVote: makeExpressVote() }));
  mocked.voteExpress.mockResolvedValue(
    makeConfirmed({ id: 'p1', expressVote: makeExpressVote({ myVote: 'REAGENDAR', counts: { CANCELAR: 0, REAGENDAR: 2, MANTENER: 0 } }) }),
  );
  await renderScreen('p1');
  expect(await screen.findByText('Votación exprés')).toBeTruthy();
  expect(screen.getByText('Cierra en 42 min')).toBeTruthy();
  await fireEvent.press(screen.getByText('Reagendar'));
  await waitFor(() => expect(showToast).toHaveBeenCalledWith('Tu voto ha sido registrado.'));
  expect(mocked.voteExpress).toHaveBeenCalledWith('p1', 'REAGENDAR');
  expect(screen.getByLabelText('Reagendar, 2 votos').props.accessibilityState.selected).toBe(true);
});

it('si el voto exprés llega tarde (409 VOTING_CLOSED), recarga el plan y muestra la votación cerrada', async () => {
  mocked.getProposal
    .mockResolvedValueOnce(makeConfirmed({ id: 'p1', expressVote: makeExpressVote() }))
    .mockResolvedValue(
      makeConfirmed({ id: 'p1', expressVote: makeExpressVote({ status: 'CERRADA', result: 'CANCELAR', resultByDefault: false, canVote: false }) }),
    );
  mocked.voteExpress.mockRejectedValue(new ApiError(409, 'VOTING_CLOSED', 'La votación ya cerró.'));
  await renderScreen('p1');
  await fireEvent.press(await screen.findByText('Mantener'));
  expect(await screen.findByText('El grupo decidió: Cancelar')).toBeTruthy();
  expect(mocked.getProposal).toHaveBeenCalledTimes(2);
  expect(screen.queryByText('¿Qué hacemos con el plan?')).toBeNull();
});

it('con la votación abierta, quien gestiona conserva «Cancelar plan»', async () => {
  mocked.getProposal.mockResolvedValue(makeConfirmed({ expressVote: makeExpressVote() }));
  await renderScreen();
  expect(await screen.findByText('Votación exprés')).toBeTruthy();
  expect(screen.getByText('Cancelar plan')).toBeTruthy();
});

it('en recoordinación quien gestiona propone franjas desde el detalle', async () => {
  const replanning = makeConfirmed({
    state: 'EN_RECOORDINACION', chosenWindowId: null, scheduledAt: null, scheduledDate: null,
    expressVote: makeExpressVote({ status: 'CERRADA', result: 'REAGENDAR', resultByDefault: false, canVote: false }),
  });
  mocked.getProposal.mockResolvedValue(replanning);
  await renderScreen();
  expect(await screen.findByText('El grupo decidió: Reagendar')).toBeTruthy();
  // En recoordinación no hay fecha a la que faltar: no se reporta.
  expect(screen.queryByText('Reportar imprevisto')).toBeNull();
  await fireEvent.press(screen.getByText('Proponer franjas'));
  expect(screen.getByText('Proponer franjas nuevas')).toBeTruthy();
});

it('en recoordinación quien no gestiona no ve «Proponer franjas»', async () => {
  mocked.getProposal.mockResolvedValue(makeConfirmed({ state: 'EN_RECOORDINACION', canManage: false, scheduledAt: null, scheduledDate: null }));
  await renderScreen();
  expect(await screen.findByText('Plan en recoordinación')).toBeTruthy();
  expect(screen.queryByText('Proponer franjas')).toBeNull();
});

it('en recoordinación con la fecha vieja ya pasada (regla anterior), quien gestiona aún propone franjas', async () => {
  // Hoy es martes 29 a las 10:00; la regla vieja dejó el plan en recoordinación con su fecha del lunes 28.
  const atascado = makeConfirmed({
    state: 'EN_RECOORDINACION', expressVote: null, scheduledAt: new Date(2026, 8, 28, 11, 0).toISOString(), scheduledDate: '2026-09-28',
  });
  mocked.getProposal.mockResolvedValue(atascado);
  await renderScreen();
  expect(await screen.findByText('Plan en recoordinación')).toBeTruthy();
  expect(screen.queryByText('Reportar imprevisto')).toBeNull();
  await fireEvent.press(screen.getByText('Proponer franjas'));
  expect(screen.getByText('Proponer franjas nuevas')).toBeTruthy();
});

it('un aviso que no es crítico se ve en «Imprevistos», sin votación', async () => {
  mocked.getProposal.mockResolvedValue(makeConfirmed());
  await renderScreen();
  expect(await screen.findByText('Ana · Imprevisto')).toBeTruthy();
  expect(screen.queryByText('Votación exprés')).toBeNull();
  expect(screen.queryByText('Mantener')).toBeNull();
});

it('un plan confirmado que ya pasó no muestra la votación exprés ni «Reportar imprevisto» (D3)', async () => {
  // Control positivo: el mismo plan, aún por ocurrir (fixture: miércoles 30), sí los muestra.
  mocked.getProposal.mockResolvedValue(makeConfirmed({ expressVote: makeExpressVote() }));
  const first = await renderScreen();
  expect(await screen.findByText('Votación exprés')).toBeTruthy();
  expect(screen.getByText('Reportar imprevisto')).toBeTruthy();
  await first.unmount();

  // Hoy es martes 29 a las 10:00: el plan del lunes 28 ya ocurrió.
  mocked.getProposal.mockResolvedValue(
    makeConfirmed({ expressVote: makeExpressVote(), scheduledAt: new Date(2026, 8, 28, 11, 0).toISOString(), scheduledDate: '2026-09-28' }),
  );
  await renderScreen();
  expect(await screen.findByText('Reunión de avance del proyecto')).toBeTruthy();
  expect(screen.getByText('Ana · Imprevisto')).toBeTruthy();
  expect(screen.queryByText('Votación exprés')).toBeNull();
  expect(screen.queryByText('Reportar imprevisto')).toBeNull();
});

it('ofrece el resumen con IA salvo en un plan cancelado', async () => {
  mocked.getProposal.mockResolvedValueOnce(makeConfirmed());
  const { unmount } = await renderScreen();
  expect(await screen.findByText('Resumen con Huecko IA')).toBeTruthy();
  await unmount();

  mocked.getProposal.mockResolvedValueOnce(makeProposal({ state: 'CANCELADO' }));
  await renderScreen('prop_2');
  expect(await screen.findByText('Repaso antes de la entrega')).toBeTruthy();
  expect(screen.queryByText('Resumen con Huecko IA')).toBeNull();
});

it('los botones de gestión siguen a canManage, no a quién creó el plan (D1)', async () => {
  // Ana creó el plan y se fue del grupo: lo gestiona el usuario actual (ORGANIZER).
  mocked.getProposal.mockResolvedValue(makeProposal({ canManage: true }));
  const first = await renderScreen('prop_2');
  expect(await screen.findByText('Confirmar plan')).toBeTruthy();
  expect(screen.getByText('Cancelar plan')).toBeTruthy();
  await first.unmount();

  // Lo creó el usuario actual, pero el servidor dice que no lo gestiona.
  mocked.getProposal.mockResolvedValue(makeProposal({ createdBy: TEST_USER, canManage: false }));
  await renderScreen('prop_2');
  expect(await screen.findByText('Repaso antes de la entrega')).toBeTruthy();
  expect(screen.queryByText('Confirmar plan')).toBeNull();
  expect(screen.queryByText('Cancelar plan')).toBeNull();
});
