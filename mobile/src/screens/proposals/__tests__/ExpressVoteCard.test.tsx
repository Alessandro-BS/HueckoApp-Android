import { fireEvent, render, screen, waitFor } from '@testing-library/react-native';

import { ApiError } from '../../../api/client';
import { makeConfirmed, makeExpressVote } from '../../../testing/fixtures';
import { showToast } from '../../../utils/toast';
import { ExpressVoteCard } from '../ExpressVoteCard';

jest.mock('../../../utils/toast', () => ({ showToast: jest.fn() }));
jest.mock('../../../utils/clock', () => ({ today: () => new Date(2026, 8, 29, 10, 0) }));

// Hoy, en los tests, es el martes 29/09/2026 a las 10:00; la votación del fixture cierra a las 10:42.
const NOW = new Date(2026, 8, 29, 10, 0);
const withVote = (over: Parameters<typeof makeExpressVote>[0] = {}) => makeConfirmed({ id: 'p1', expressVote: makeExpressVote(over) });

const renderCard = async (proposal = withVote(), handlers: { onVote?: jest.Mock; onReplan?: jest.Mock } = {}) => {
  const onVote = handlers.onVote ?? jest.fn().mockResolvedValue(undefined);
  const onReplan = handlers.onReplan ?? jest.fn().mockResolvedValue(undefined);
  const onStale = jest.fn();
  await render(<ExpressVoteCard proposal={proposal} now={NOW} onVote={onVote} onReplan={onReplan} onStale={onStale} />);
  return { onVote, onReplan, onStale };
};

beforeEach(() => jest.clearAllMocks());

it('abierta: quién avisó, motivo, por qué es crítica, recuento y «Cierra en 42 min»', async () => {
  await renderCard();
  expect(screen.getByText('Votación exprés')).toBeTruthy();
  expect(screen.getByText('Ana no podrá asistir')).toBeTruthy();
  expect(screen.getByText('Me surgió un viaje familiar.')).toBeTruthy();
  expect(screen.getByText('Ausencia crítica: el grupo lo marcó como imprescindible')).toBeTruthy();
  expect(screen.getByText('Cierra en 42 min')).toBeTruthy();
  expect(screen.getByLabelText('Cancelar, 0 votos')).toBeTruthy();
  expect(screen.getByLabelText('Reagendar, 1 voto')).toBeTruthy();
  expect(screen.getByLabelText('Mantener, 0 votos')).toBeTruthy();
  // Sin sugerencia de la IA todavía.
  expect(screen.queryByText(/Huecko sugiere/)).toBeNull();
});

it('votar «Reagendar» envía la opción y avisa', async () => {
  const { onVote } = await renderCard();
  await fireEvent.press(screen.getByText('Reagendar'));
  await waitFor(() => expect(showToast).toHaveBeenCalledWith('Tu voto ha sido registrado.'));
  expect(onVote).toHaveBeenCalledWith('REAGENDAR');
});

it('marca mi voto y tocarlo otra vez no vuelve a enviarlo', async () => {
  const { onVote } = await renderCard(withVote({ myVote: 'MANTENER', counts: { CANCELAR: 0, REAGENDAR: 1, MANTENER: 1 } }));
  expect(screen.getByLabelText('Mantener, 1 voto').props.accessibilityState.selected).toBe(true);
  expect(screen.getByLabelText('Reagendar, 1 voto').props.accessibilityState.selected).toBe(false);
  await fireEvent.press(screen.getByText('Mantener'));
  expect(onVote).not.toHaveBeenCalled();
  // Cambiar el voto sí se envía.
  await fireEvent.press(screen.getByText('Cancelar'));
  await waitFor(() => expect(onVote).toHaveBeenCalledWith('CANCELAR'));
});

it('quien avisó (canVote = false) ve los botones desactivados y no vota', async () => {
  const { onVote } = await renderCard(withVote({ canVote: false }));
  for (const label of ['Cancelar, 0 votos', 'Reagendar, 1 voto', 'Mantener, 0 votos']) {
    expect(screen.getByLabelText(label).props.accessibilityState.disabled).toBe(true);
  }
  expect(screen.getByText('No votas en esta votación.')).toBeTruthy();
  await fireEvent.press(screen.getByText('Reagendar'));
  expect(onVote).not.toHaveBeenCalled();
});

it('muestra la sugerencia de la IA cuando llega', async () => {
  await renderCard(withVote({ recommendation: { option: 'REAGENDAR', reason: 'Faltan 25 horas: hay tiempo para otra fecha.' } }));
  expect(screen.getByText('Huecko sugiere: Reagendar — Faltan 25 horas: hay tiempo para otra fecha.')).toBeTruthy();
});

it('si el voto falla muestra el mensaje del servidor y deja volver a votar', async () => {
  const onVote = jest.fn().mockRejectedValue(new ApiError(409, 'VOTING_CLOSED', 'La votación ya cerró.'));
  await renderCard(withVote(), { onVote });
  await fireEvent.press(screen.getByText('Mantener'));
  expect(await screen.findByText('La votación ya cerró.')).toBeTruthy();
  expect(showToast).not.toHaveBeenCalled();
  await fireEvent.press(screen.getByText('Mantener'));
  expect(onVote).toHaveBeenCalledTimes(2);
});

it('si el voto falla pide recargar el plan (la votación pudo cerrarse); si sale bien, no', async () => {
  const onVote = jest.fn().mockRejectedValueOnce(new ApiError(409, 'VOTING_CLOSED', 'La votación ya cerró.')).mockResolvedValue(undefined);
  const { onStale } = await renderCard(withVote(), { onVote });
  await fireEvent.press(screen.getByText('Mantener'));
  await waitFor(() => expect(onStale).toHaveBeenCalledTimes(1));
  // Control positivo: un voto que sí se registra no recarga.
  await fireEvent.press(screen.getByText('Cancelar'));
  await waitFor(() => expect(showToast).toHaveBeenCalledWith('Tu voto ha sido registrado.'));
  expect(onStale).toHaveBeenCalledTimes(1);
});

it('cerrada con resultado: «El grupo decidió: Reagendar», sin botones', async () => {
  await renderCard(withVote({ status: 'CERRADA', result: 'REAGENDAR', resultByDefault: false, canVote: false, closedAt: NOW.toISOString() }));
  expect(screen.getByText('El grupo decidió: Reagendar')).toBeTruthy();
  expect(screen.queryByText('Cierra en 42 min')).toBeNull();
  expect(screen.queryByLabelText('Reagendar, 1 voto')).toBeNull();
});

it('cerrada sin quórum: «Sin quórum: el plan se mantiene»', async () => {
  await renderCard(withVote({ status: 'CERRADA', result: 'MANTENER', resultByDefault: true, canVote: false, closedAt: NOW.toISOString() }));
  expect(screen.getByText('Sin quórum: el plan se mantiene')).toBeTruthy();
  expect(screen.queryByText('El grupo decidió: Mantener')).toBeNull();
});

it('en recoordinación quien gestiona propone franjas nuevas con ReplanSheet', async () => {
  const proposal = makeConfirmed({
    id: 'p1', state: 'EN_RECOORDINACION', canManage: true, chosenWindowId: null, scheduledAt: null, scheduledDate: null,
    expressVote: makeExpressVote({ status: 'CERRADA', result: 'REAGENDAR', resultByDefault: false, canVote: false }),
  });
  const { onReplan } = await renderCard(proposal);
  expect(screen.getByText('El grupo decidió: Reagendar')).toBeTruthy();
  await fireEvent.press(screen.getByText('Proponer franjas'));
  expect(screen.getByText('Proponer franjas nuevas')).toBeTruthy();

  const pick = async (date: Date) => {
    await fireEvent.press(screen.getByLabelText('Nueva fecha límite de votación'));
    await fireEvent(screen.getByTestId('datetimepicker-date'), 'valueChange', { nativeEvent: {} }, date);
    await fireEvent(screen.getByTestId('datetimepicker-time'), 'valueChange', { nativeEvent: {} }, date);
  };
  const add = async (day: string, start: string, end: string) => {
    await fireEvent.press(screen.getByText(day));
    await fireEvent.changeText(screen.getByLabelText('Hora de inicio (HH:mm)'), start);
    await fireEvent.changeText(screen.getByLabelText('Hora de fin (HH:mm)'), end);
    await fireEvent.press(screen.getByText('Añadir franja'));
  };
  await pick(new Date(2026, 8, 30, 20, 0));
  await add('Vie', '18:00', '19:00');
  await add('Sáb', '10:00', '11:00');
  await fireEvent.press(screen.getByLabelText('Abrir nueva votación'));
  await waitFor(() =>
    expect(onReplan).toHaveBeenCalledWith({
      votingDeadline: new Date(2026, 8, 30, 20, 0).toISOString(),
      windows: [
        { date: '2026-10-02', startTime: '18:00', endTime: '19:00' },
        { date: '2026-10-03', startTime: '10:00', endTime: '11:00' },
      ],
    }),
  );
  expect(showToast).toHaveBeenCalledWith('Franjas propuestas: el grupo vuelve a votar la fecha.');
});

it('en recoordinación quien no gestiona no ve «Proponer franjas»', async () => {
  await renderCard(makeConfirmed({ id: 'p1', state: 'EN_RECOORDINACION', canManage: false, scheduledAt: null, scheduledDate: null, expressVote: null }));
  expect(screen.getByText('Plan en recoordinación')).toBeTruthy();
  expect(screen.queryByText('Proponer franjas')).toBeNull();
  expect(screen.getByText('Quien organiza el plan propondrá franjas nuevas.')).toBeTruthy();
});
