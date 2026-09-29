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
const renderScreen = (params?: { initialDay?: number }) =>
  render(<AddScheduleScreen navigation={navigation} route={{ key: 'AddSchedule', name: 'AddSchedule', params } as any} />);

beforeEach(() => jest.clearAllMocks());

it('empieza con 08:00–09:00 y muestra las pistas de cada hora', async () => {
  await renderScreen();
  expect(screen.getByLabelText('Hora de inicio').props.value).toBe('08:00');
  expect(screen.getByLabelText('Hora de fin').props.value).toBe('09:00');
  expect(screen.getByText('Inicio')).toBeTruthy();
  expect(screen.getByText('Fin')).toBeTruthy();
});

it('valida formato y orden de las horas y no guarda si no son válidas', async () => {
  await renderScreen();
  await fireEvent.changeText(screen.getByLabelText('Nombre del bloque'), 'Cálculo');
  await fireEvent.changeText(screen.getByLabelText('Hora de inicio'), '8:00');
  expect(screen.getByText('Formato HH:mm')).toBeTruthy();
  await fireEvent.changeText(screen.getByLabelText('Hora de inicio'), '10:00');
  await fireEvent.changeText(screen.getByLabelText('Hora de fin'), '09:30');
  expect(screen.getByText('Debe ser posterior')).toBeTruthy();
  // Se envía por el teclado: el botón deshabilitado no demostraría nada, aquí solo frena la guarda de submit.
  await fireEvent(screen.getByLabelText('Hora de fin'), 'submitEditing');
  expect(mocked.createTimeBlock).not.toHaveBeenCalled();
});

it('control positivo: con nombre y horas válidas, enviar desde «Hora de fin» sí guarda', async () => {
  mocked.createTimeBlock.mockResolvedValue({} as any);
  await renderScreen({ initialDay: 2 });
  await fireEvent.changeText(screen.getByLabelText('Nombre del bloque'), 'Cálculo');
  await fireEvent.changeText(screen.getByLabelText('Hora de inicio'), '10:00');
  await fireEvent.changeText(screen.getByLabelText('Hora de fin'), '11:30');
  await fireEvent(screen.getByLabelText('Hora de fin'), 'submitEditing');

  await waitFor(() => expect(navigation.goBack).toHaveBeenCalled());
  expect(mocked.createTimeBlock).toHaveBeenCalledWith({
    label: 'Cálculo', type: 'CLASE', startTime: '10:00', endTime: '11:30',
    isRecurring: true, dayOfWeek: 2, date: null,
  });
});

it('sin nombre no guarda (sin mensaje, como en Kotlin)', async () => {
  await renderScreen();
  await fireEvent(screen.getByLabelText('Hora de fin'), 'submitEditing');
  expect(mocked.createTimeBlock).not.toHaveBeenCalled();
});

it('guarda un bloque recurrente del día recibido, con el tipo elegido, y vuelve atrás', async () => {
  mocked.createTimeBlock.mockResolvedValue({} as any);
  await renderScreen({ initialDay: 3 });
  await fireEvent.changeText(screen.getByLabelText('Nombre del bloque'), '  Clase de Cálculo ');
  await fireEvent.changeText(screen.getByLabelText('Hora de fin'), '10:00');
  await fireEvent.press(screen.getByText('Trabajo'));
  await fireEvent.press(screen.getByText('Guardar bloque'));

  await waitFor(() => expect(navigation.goBack).toHaveBeenCalled());
  expect(mocked.createTimeBlock).toHaveBeenCalledWith({
    label: 'Clase de Cálculo', type: 'TRABAJO', startTime: '08:00', endTime: '10:00',
    isRecurring: true, dayOfWeek: 3, date: null,
  });
  expect(showToast).toHaveBeenCalledWith('Bloque guardado.');
});

it('un bloque puntual lleva fecha (no día) y tipo PUNTUAL por defecto', async () => {
  mocked.createTimeBlock.mockResolvedValue({} as any);
  await renderScreen();
  await fireEvent.changeText(screen.getByLabelText('Nombre del bloque'), 'Dentista');
  await fireEvent.press(screen.getByText('Puntual (Única vez)'));
  expect(screen.queryByText('Día de la semana')).toBeNull();
  await fireEvent.press(screen.getByText('Vie 2 oct'));
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
