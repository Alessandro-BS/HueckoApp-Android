import type { TimeBlock } from '@hueckoapp/shared';
import { fireEvent, render, screen, waitFor } from '@testing-library/react-native';

import { ApiError } from '../../../api/client';
import * as scheduleApi from '../../../api/schedule';
import { showToast } from '../../../utils/toast';
import { AddScheduleScreen } from '../AddScheduleScreen';

jest.mock('../../../api/schedule');
jest.mock('../../../utils/toast', () => ({ showToast: jest.fn() }));
jest.mock('../../../utils/clock', () => ({ today: () => new Date(2026, 8, 29, 10, 0) }));

const mocked = scheduleApi as jest.Mocked<typeof scheduleApi>;
const navigation = { goBack: jest.fn() } as any;
const renderScreen = (params?: { initialDay?: number; block?: TimeBlock }) =>
  render(<AddScheduleScreen navigation={navigation} route={{ key: 'AddSchedule', name: 'AddSchedule', params } as any} />);

beforeEach(() => jest.clearAllMocks());

// Elige la hora con el reloj nativo (mockeado en jest.setup.ts): ya no se escribe con el teclado.
const pickTime = async (label: string, hours: number, minutes: number) => {
  await fireEvent.press(screen.getByLabelText(label));
  await fireEvent(screen.getByTestId('datetimepicker-time'), 'valueChange', { nativeEvent: {} }, new Date(2026, 8, 29, hours, minutes));
};
const saveButton = () => screen.getByRole('button', { name: 'Guardar bloque' });

it('empieza con 08:00–09:00, sin teclado: cada hora es un campo que abre el reloj', async () => {
  await renderScreen();
  expect(screen.getByText('08:00')).toBeTruthy();
  expect(screen.getByText('09:00')).toBeTruthy();
  expect(screen.getByText('Inicio')).toBeTruthy();
  expect(screen.getByText('Fin')).toBeTruthy();
  expect(screen.getByLabelText('Hora de inicio').props.accessibilityRole).toBe('button');
});

it('valida el orden de las horas y no guarda si el fin no es posterior', async () => {
  await renderScreen();
  await fireEvent.changeText(screen.getByLabelText('Nombre del bloque'), 'Cálculo');
  await pickTime('Hora de inicio', 10, 0);
  await pickTime('Hora de fin', 9, 30);
  expect(screen.getByText('Debe ser posterior')).toBeTruthy();
  expect(saveButton().props.accessibilityState.disabled).toBe(true);
  await fireEvent.press(saveButton());
  expect(mocked.createTimeBlock).not.toHaveBeenCalled();
});

it('control positivo: con nombre y horas elegidas en el reloj, guarda en «HH:mm»', async () => {
  mocked.createTimeBlock.mockResolvedValue({} as any);
  await renderScreen({ initialDay: 2 });
  await fireEvent.changeText(screen.getByLabelText('Nombre del bloque'), 'Cálculo');
  await pickTime('Hora de inicio', 10, 0);
  await pickTime('Hora de fin', 11, 30);
  await fireEvent.press(saveButton());

  await waitFor(() => expect(navigation.goBack).toHaveBeenCalled());
  expect(mocked.createTimeBlock).toHaveBeenCalledWith({
    label: 'Cálculo', type: 'CLASE', startTime: '10:00', endTime: '11:30',
    isRecurring: true, dayOfWeek: 2, date: null,
  });
});

it('sin nombre no guarda (sin mensaje, como en Kotlin)', async () => {
  await renderScreen();
  await fireEvent.press(saveButton());
  expect(mocked.createTimeBlock).not.toHaveBeenCalled();
});

it('guarda un bloque recurrente del día recibido, con el tipo elegido, y vuelve atrás', async () => {
  mocked.createTimeBlock.mockResolvedValue({} as any);
  await renderScreen({ initialDay: 3 });
  await fireEvent.changeText(screen.getByLabelText('Nombre del bloque'), '  Clase de Cálculo ');
  await pickTime('Hora de fin', 10, 0);
  await fireEvent.press(screen.getByText('Trabajo'));
  await fireEvent.press(screen.getByText('Guardar bloque'));

  await waitFor(() => expect(navigation.goBack).toHaveBeenCalled());
  expect(mocked.createTimeBlock).toHaveBeenCalledWith({
    label: 'Clase de Cálculo', type: 'TRABAJO', startTime: '08:00', endTime: '10:00',
    isRecurring: true, dayOfWeek: 3, date: null,
  });
  expect(showToast).toHaveBeenCalledWith('Bloque guardado.');
});

it('un bloque puntual lleva fecha (no día), elegida con el selector nativo, y tipo PUNTUAL por defecto', async () => {
  mocked.createTimeBlock.mockResolvedValue({} as any);
  await renderScreen();
  await fireEvent.changeText(screen.getByLabelText('Nombre del bloque'), 'Dentista');
  await fireEvent.press(screen.getByText('Puntual (Única vez)'));
  expect(screen.queryByText('Día de la semana')).toBeNull();
  expect(screen.getByText('Mar 29 sep')).toBeTruthy(); // hoy, por defecto
  await fireEvent.press(screen.getByLabelText('Fecha'));
  expect(screen.getByTestId('datetimepicker-date').props.minimumDate).toEqual(new Date(2026, 8, 29));
  await fireEvent(screen.getByTestId('datetimepicker-date'), 'valueChange', { nativeEvent: {} }, new Date(2026, 9, 2));
  expect(screen.getByText('Vie 2 oct')).toBeTruthy();
  await fireEvent.press(screen.getByText('Guardar bloque'));

  await waitFor(() => expect(mocked.createTimeBlock).toHaveBeenCalled());
  expect(mocked.createTimeBlock).toHaveBeenCalledWith({
    label: 'Dentista', type: 'PUNTUAL', startTime: '08:00', endTime: '09:00',
    isRecurring: false, dayOfWeek: null, date: '2026-10-02',
  });
});

it('muestra el error del servidor y se queda en la pantalla', async () => {
  mocked.createTimeBlock.mockRejectedValue(
    new ApiError(400, 'VALIDATION_ERROR', 'Datos inválidos', [{ message: 'Máximo 80 caracteres' }]),
  );
  await renderScreen();
  await fireEvent.changeText(screen.getByLabelText('Nombre del bloque'), 'Clase');
  await fireEvent.press(screen.getByText('Guardar bloque'));
  expect(await screen.findByText('Máximo 80 caracteres')).toBeTruthy();
  expect(navigation.goBack).not.toHaveBeenCalled();
});

const saved: TimeBlock = {
  id: 'b7', userId: 'u1', label: 'Cálculo II', type: 'TRABAJO', startTime: '09:00', endTime: '11:00',
  isRecurring: true, dayOfWeek: 4, date: null,
};

it('con un bloque en la ruta abre rellena y guarda con updateTimeBlock', async () => {
  mocked.updateTimeBlock.mockResolvedValue({} as any);
  await renderScreen({ block: saved });
  expect(screen.getByLabelText('Nombre del bloque').props.value).toBe('Cálculo II');
  expect(screen.getByText('09:00')).toBeTruthy();
  expect(screen.getByText('11:00')).toBeTruthy();
  await fireEvent.changeText(screen.getByLabelText('Nombre del bloque'), 'Cálculo III');
  await fireEvent.press(saveButton());

  await waitFor(() => expect(navigation.goBack).toHaveBeenCalled());
  expect(mocked.updateTimeBlock).toHaveBeenCalledWith('b7', {
    label: 'Cálculo III', type: 'TRABAJO', startTime: '09:00', endTime: '11:00',
    isRecurring: true, dayOfWeek: 4, date: null,
  });
  expect(mocked.createTimeBlock).not.toHaveBeenCalled();
});

it('editar un puntual conserva su fecha y su tipo', async () => {
  mocked.updateTimeBlock.mockResolvedValue({} as any);
  await renderScreen({ block: { ...saved, type: 'PUNTUAL', isRecurring: false, dayOfWeek: null, date: '2026-10-02' } });
  expect(screen.getByText('Vie 2 oct')).toBeTruthy();
  await fireEvent.press(saveButton());
  await waitFor(() => expect(mocked.updateTimeBlock).toHaveBeenCalled());
  expect(mocked.updateTimeBlock).toHaveBeenCalledWith('b7', expect.objectContaining({
    type: 'PUNTUAL', isRecurring: false, dayOfWeek: null, date: '2026-10-02',
  }));
});

it('un 409 de solape se ve con el mensaje del servidor y no se vuelve atrás', async () => {
  mocked.updateTimeBlock.mockRejectedValue(
    new ApiError(409, 'TIME_BLOCK_OVERLAP', 'Se solapa con «Cálculo II» (lunes 08:00–11:00).', { blockId: 'b1' }),
  );
  await renderScreen({ block: saved });
  await fireEvent.press(saveButton());
  expect(await screen.findByText('Se solapa con «Cálculo II» (lunes 08:00–11:00).')).toBeTruthy();
  expect(navigation.goBack).not.toHaveBeenCalled();
});
