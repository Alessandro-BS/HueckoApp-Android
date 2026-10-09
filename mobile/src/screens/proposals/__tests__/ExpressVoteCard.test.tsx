import { act, fireEvent, render, screen, waitFor } from '@testing-library/react-native';
import { Alert } from 'react-native';

import { ApiError } from '../../../api/client';
import { showToast } from '../../../utils/toast';
import { ExpressVoteCard } from '../ExpressVoteCard';

jest.mock('../../../utils/toast', () => ({ showToast: jest.fn() }));
jest.mock('../../../utils/clock', () => ({ today: () => new Date(2026, 8, 29, 10, 0) }));

const base = {
  kind: 'AVISO' as const,
  who: 'Ana',
  reason: 'Cruce con un examen de laboratorio a última hora.',
  planTitle: 'Reunión de avance del proyecto',
  canResolve: true,
};

beforeEach(() => jest.clearAllMocks());

it('aviso: título y texto; «Mantener» resuelve con CONFIRMADO y avisa', async () => {
  const onResolve = jest.fn().mockResolvedValue(undefined);
  const onResolved = jest.fn();
  await render(<ExpressVoteCard {...base} onResolve={onResolve} onResolved={onResolved} />);
  expect(screen.getByText('Aviso de imprevisto')).toBeTruthy();
  expect(screen.getByText('Ana reportó un imprevisto en «Reunión de avance del proyecto»')).toBeTruthy();
  expect(screen.getByText('Cruce con un examen de laboratorio a última hora.')).toBeTruthy();
  await fireEvent.press(screen.getByText('Mantener'));
  await waitFor(() => expect(onResolved).toHaveBeenCalled());
  expect(onResolve).toHaveBeenCalledWith({ newState: 'CONFIRMADO' });
  expect(showToast).toHaveBeenCalledWith('Votación exprés registrada: mantener.');
});

it('«Cancelar» pide la misma confirmación que «Cancelar plan» y solo resuelve con CANCELADO al confirmar', async () => {
  const alert = jest.spyOn(Alert, 'alert').mockImplementation(() => {});
  const onResolve = jest.fn().mockResolvedValue(undefined);
  await render(<ExpressVoteCard {...base} onResolve={onResolve} />);
  await fireEvent.press(screen.getByText('Cancelar'));
  expect(alert).toHaveBeenCalledWith(
    'Cancelar plan',
    '¿Seguro que quieres cancelar «Reunión de avance del proyecto»? El grupo dejará de verlo como pendiente.',
    expect.any(Array),
  );
  const [volver, cancelar] = alert.mock.calls[0][2]!;
  expect([volver.text, cancelar.text]).toEqual(['Volver', 'Cancelar plan']);
  // Mientras no se confirma, no se envía nada.
  expect(onResolve).not.toHaveBeenCalled();

  await act(async () => cancelar.onPress!());
  await waitFor(() => expect(onResolve).toHaveBeenCalledWith({ newState: 'CANCELADO' }));
  expect(showToast).toHaveBeenCalledWith('Votación exprés registrada: cancelar.');
});

it('«Reprogramar» pide una nueva fecha límite futura antes de enviar (G4)', async () => {
  const onResolve = jest.fn().mockResolvedValue(undefined);
  await render(<ExpressVoteCard {...base} onResolve={onResolve} />);
  await fireEvent.press(screen.getByText('Reprogramar'));
  expect(screen.getByText('Reprogramar plan')).toBeTruthy();
  expect(screen.getByLabelText('Abrir nueva votación').props.accessibilityState.disabled).toBe(true);

  const pick = async (date: Date) => {
    await fireEvent.press(screen.getByLabelText('Nueva fecha límite de votación'));
    await fireEvent(screen.getByTestId('datetimepicker-date'), 'valueChange', { nativeEvent: {} }, date);
    await fireEvent(screen.getByTestId('datetimepicker-time'), 'valueChange', { nativeEvent: {} }, date);
  };
  await pick(new Date(2026, 8, 29, 9, 0));
  expect(screen.getByText('La fecha límite debe ser futura')).toBeTruthy();
  expect(screen.getByLabelText('Abrir nueva votación').props.accessibilityState.disabled).toBe(true);

  await pick(new Date(2026, 9, 5, 20, 0));
  await fireEvent.press(screen.getByText('Abrir nueva votación'));
  await waitFor(() =>
    expect(onResolve).toHaveBeenCalledWith({ newState: 'PROPUESTO', votingDeadline: new Date(2026, 9, 5, 20, 0).toISOString() }),
  );
  expect(showToast).toHaveBeenCalledWith('Votación exprés registrada: reprogramar.');
});

it('re-coordinación: «Votación exprés» y «no podrá asistir»', async () => {
  await render(<ExpressVoteCard {...base} kind="RECOORDINACION" onResolve={jest.fn()} />);
  expect(screen.getByText('Votación exprés')).toBeTruthy();
  expect(screen.getByText('Ana no podrá asistir a «Reunión de avance del proyecto»')).toBeTruthy();
});

it('sin permiso de gestión no hay botones (B20)', async () => {
  await render(<ExpressVoteCard {...base} canResolve={false} onResolve={jest.fn()} />);
  expect(screen.queryByText('Mantener')).toBeNull();
  expect(screen.getByText('Solo quien organiza el plan puede decidir qué hacer con él.')).toBeTruthy();
});

it('si falla, muestra el error y deja volver a elegir', async () => {
  const onResolve = jest.fn().mockRejectedValue(new ApiError(409, 'INVALID_STATE', 'El plan no admite esta acción en su estado actual.'));
  await render(<ExpressVoteCard {...base} onResolve={onResolve} />);
  await fireEvent.press(screen.getByText('Mantener'));
  expect(await screen.findByText('El plan no admite esta acción en su estado actual.')).toBeTruthy();
  expect(showToast).not.toHaveBeenCalled();
  await fireEvent.press(screen.getByText('Mantener'));
  expect(onResolve).toHaveBeenCalledTimes(2);
});
