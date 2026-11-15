import { fireEvent, render, screen, waitFor } from '@testing-library/react-native';

import { ApiError } from '../../../api/client';
import { ReplanSheet } from '../ReplanSheet';

// Martes 29 de septiembre de 2026, 10:00.
const NOW = new Date(2026, 8, 29, 10, 0);
const onSubmit = jest.fn();
const onDismiss = jest.fn();

const renderSheet = () =>
  render(<ReplanSheet title="Replantear propuesta" submitLabel="Abrir nueva votación" now={NOW} onSubmit={onSubmit} onDismiss={onDismiss} />);

const pickDeadline = async (date: Date) => {
  await fireEvent.press(screen.getByLabelText('Nueva fecha límite de votación'));
  await fireEvent(screen.getByTestId('datetimepicker-date'), 'valueChange', { nativeEvent: {} }, date);
  await fireEvent(screen.getByTestId('datetimepicker-time'), 'valueChange', { nativeEvent: {} }, date);
};
const addWindow = async (day: string, start: string, end: string) => {
  await fireEvent.press(screen.getByText(day));
  await fireEvent.changeText(screen.getByLabelText('Hora de inicio (HH:mm)'), start);
  await fireEvent.changeText(screen.getByLabelText('Hora de fin (HH:mm)'), end);
  await fireEvent.press(screen.getByText('Añadir franja'));
};
const submitDisabled = () => screen.getByLabelText('Abrir nueva votación').props.accessibilityState.disabled;

beforeEach(() => jest.clearAllMocks());

it('pide plazo y 2 a 5 franjas; envía votingDeadline y windows con fecha', async () => {
  onSubmit.mockResolvedValue(undefined);
  await renderSheet();
  expect(screen.getByText('Replantear propuesta')).toBeTruthy();
  expect(submitDisabled()).toBe(true);

  await pickDeadline(new Date(2026, 8, 29, 17, 0));
  await addWindow('Vie', '18:00', '19:00');
  expect(screen.getByText('Elige entre 2 y 5 franjas')).toBeTruthy();
  expect(submitDisabled()).toBe(true);
  await addWindow('Sáb', '10:00', '11:00');
  expect(screen.queryByText('Elige entre 2 y 5 franjas')).toBeNull();

  await fireEvent.press(screen.getByLabelText('Abrir nueva votación'));
  await waitFor(() => expect(onSubmit).toHaveBeenCalledTimes(1));
  expect(onSubmit).toHaveBeenCalledWith({
    votingDeadline: new Date(2026, 8, 29, 17, 0).toISOString(),
    windows: [
      { date: '2026-10-02', startTime: '18:00', endTime: '19:00' },
      { date: '2026-10-03', startTime: '10:00', endTime: '11:00' },
    ],
  });
});

it('un plazo que no es anterior a la primera franja se señala y no deja enviar', async () => {
  await renderSheet();
  await pickDeadline(new Date(2026, 8, 29, 17, 0));
  await addWindow('Vie', '18:00', '19:00');
  await addWindow('Sáb', '10:00', '11:00');
  expect(submitDisabled()).toBeFalsy();
  await pickDeadline(new Date(2026, 9, 2, 18, 30));
  expect(screen.getByText('La votación debe cerrar antes de la primera franja')).toBeTruthy();
  expect(submitDisabled()).toBe(true);
});

it('muestra el error del servidor y deja reintentar', async () => {
  onSubmit.mockRejectedValue(new ApiError(409, 'INVALID_STATE', 'La propuesta ya no está en votación.'));
  await renderSheet();
  await pickDeadline(new Date(2026, 8, 29, 17, 0));
  await addWindow('Vie', '18:00', '19:00');
  await addWindow('Sáb', '10:00', '11:00');
  await fireEvent.press(screen.getByLabelText('Abrir nueva votación'));
  expect(await screen.findByText('La propuesta ya no está en votación.')).toBeTruthy();
});

it('un plazo que ya pasó se señala («La fecha límite debe ser futura») y no deja enviar', async () => {
  await renderSheet();
  await pickDeadline(new Date(2026, 8, 29, 9, 0));
  await addWindow('Vie', '18:00', '19:00');
  await addWindow('Sáb', '10:00', '11:00');
  expect(screen.getByText('La fecha límite debe ser futura')).toBeTruthy();
  expect(submitDisabled()).toBe(true);
  // Control positivo: con un plazo futuro el aviso desaparece y ya se puede enviar.
  await pickDeadline(new Date(2026, 8, 29, 17, 0));
  expect(screen.queryByText('La fecha límite debe ser futura')).toBeNull();
  expect(submitDisabled()).toBeFalsy();
});
