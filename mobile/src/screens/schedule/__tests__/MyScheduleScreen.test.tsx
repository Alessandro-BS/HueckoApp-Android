import type { TimeBlock } from '@hueckoapp/shared';
import { act, fireEvent, render, screen, waitFor } from '@testing-library/react-native';
import { Alert } from 'react-native';

import { ApiError } from '../../../api/client';
import * as scheduleApi from '../../../api/schedule';
import { showToast } from '../../../utils/toast';
import { MyScheduleScreen } from '../MyScheduleScreen';

jest.mock('../../../api/schedule');
jest.mock('../../../utils/toast', () => ({ showToast: jest.fn() }));
jest.mock('../../../hooks/useRefreshOnFocus', () => ({ useRefreshOnFocus: jest.fn() }));
// Hoy es martes 29 de septiembre de 2026.
jest.mock('../../../utils/clock', () => ({ today: () => new Date(2026, 8, 29, 10, 0) }));

const mocked = scheduleApi as jest.Mocked<typeof scheduleApi>;
const navigation = { navigate: jest.fn() } as any;
const block = (over: Partial<TimeBlock>): TimeBlock => ({
  id: 'b', userId: 'u1', label: 'Bloque', type: 'CLASE', startTime: '08:00', endTime: '10:00',
  isRecurring: true, dayOfWeek: 1, date: null, ...over,
});
const renderScreen = () => render(<MyScheduleScreen navigation={navigation} route={{} as any} />);

beforeEach(() => jest.clearAllMocks());

it('sin bloques muestra el estado vacío y su acción abre el formulario en el día de hoy', async () => {
  mocked.listTimeBlocks.mockResolvedValue([]);
  await renderScreen();
  expect(await screen.findByText('Aún no tienes horarios registrados')).toBeTruthy();
  await fireEvent.press(screen.getByText('Añadir mi primer bloque'));
  expect(navigation.navigate).toHaveBeenCalledWith('AddSchedule', { initialDay: 2 });
});

it('arranca en hoy (martes) y muestra un puntual de esta semana en su día', async () => {
  mocked.listTimeBlocks.mockResolvedValue([
    block({ id: 'b1', label: 'Clase de Android', dayOfWeek: 1 }),
    block({ id: 'b2', label: 'Tutoría', dayOfWeek: 2, startTime: '11:00', endTime: '12:00' }),
    block({
      id: 'b3', label: 'Dentista', type: 'PUNTUAL', isRecurring: false, dayOfWeek: null,
      date: '2026-10-02', startTime: '15:00', endTime: '16:00',
    }),
  ]);
  await renderScreen();
  expect(await screen.findByText('Tutoría')).toBeTruthy();
  expect(screen.queryByText('Clase de Android')).toBeNull();

  await fireEvent.press(screen.getByText('Vie'));
  expect(screen.getByText('Dentista')).toBeTruthy();
  expect(screen.getByText('Vie 2 oct · 15:00 - 16:00')).toBeTruthy();
  expect(screen.getByText('Puntual')).toBeTruthy();

  await fireEvent.press(screen.getByText('Jue'));
  expect(screen.getByText('Sin bloques el Jue')).toBeTruthy();
  // Los puntuales de esta semana no se repiten en la sección de próximos.
  expect(screen.queryByText('Próximos bloques puntuales')).toBeNull();
});

it('lista aparte los puntuales posteriores a esta semana, por fecha y hora, y permite borrarlos', async () => {
  mocked.listTimeBlocks.mockResolvedValue([
    block({ id: 'p2', label: 'Reunión', type: 'PUNTUAL', isRecurring: false, dayOfWeek: null, date: '2026-10-12', startTime: '15:00', endTime: '16:00' }),
    block({ id: 'p1', label: 'Examen', type: 'PUNTUAL', isRecurring: false, dayOfWeek: null, date: '2026-10-12', startTime: '09:00', endTime: '11:00' }),
    block({ id: 'p0', label: 'Esta semana', type: 'PUNTUAL', isRecurring: false, dayOfWeek: null, date: '2026-10-02' }),
  ]);
  const alert = jest.spyOn(Alert, 'alert').mockImplementation(() => {});
  await renderScreen();
  expect(await screen.findByText('Próximos bloques puntuales')).toBeTruthy();
  expect(screen.getByText('Examen')).toBeTruthy();
  expect(screen.getByText('Reunión')).toBeTruthy();
  expect(screen.queryByText('Esta semana')).toBeNull();
  expect(screen.getAllByText('Lun 12/10')).toHaveLength(2);
  const order = screen.getAllByText(/^(Examen|Reunión)$/).map((n) => n.props.children);
  expect(order).toEqual(['Examen', 'Reunión']);

  await fireEvent.press(screen.getByLabelText('Eliminar Examen'));
  expect(alert).toHaveBeenCalledWith(
    'Eliminar bloque',
    '¿Seguro que quieres eliminar «Examen» de tu horario?',
    expect.any(Array),
  );
});

it('pide confirmación antes de borrar y solo borra al confirmar', async () => {
  mocked.listTimeBlocks.mockResolvedValue([block({ id: 'b2', label: 'Tutoría', dayOfWeek: 2 })]);
  mocked.deleteTimeBlock.mockResolvedValue();
  const alert = jest.spyOn(Alert, 'alert').mockImplementation(() => {});
  await renderScreen();

  await fireEvent.press(await screen.findByLabelText('Eliminar Tutoría'));
  expect(alert).toHaveBeenCalledWith(
    'Eliminar bloque',
    '¿Seguro que quieres eliminar «Tutoría» de tu horario?',
    expect.any(Array),
  );
  expect(mocked.deleteTimeBlock).not.toHaveBeenCalled();

  const buttons = alert.mock.calls[0][2]!;
  await act(async () => buttons.find((b) => b.text === 'Eliminar')!.onPress!());
  await waitFor(() => expect(screen.queryByText('Tutoría')).toBeNull());
  expect(mocked.deleteTimeBlock).toHaveBeenCalledWith('b2');
  expect(showToast).toHaveBeenCalledWith('Bloque eliminado.');
});

it('"Escanear" avisa que llega en la Fase 4', async () => {
  mocked.listTimeBlocks.mockResolvedValue([]);
  await renderScreen();
  await fireEvent.press(screen.getByText('Escanear'));
  expect(showToast).toHaveBeenCalledWith('Disponible en la Fase 4');
});

it('si falla la carga muestra el error y permite reintentar', async () => {
  mocked.listTimeBlocks
    .mockRejectedValueOnce(new ApiError(0, 'NETWORK_ERROR', 'No se pudo conectar con el servidor. Revisa tu conexión.'))
    .mockResolvedValueOnce([]);
  await renderScreen();
  expect(await screen.findByText('No se pudo conectar con el servidor. Revisa tu conexión.')).toBeTruthy();
  await fireEvent.press(screen.getByText('Reintentar'));
  expect(await screen.findByText('Aún no tienes horarios registrados')).toBeTruthy();
});
