import type { TimeBlockInput } from '@hueckoapp/shared';
import { act, fireEvent, render, screen, waitFor } from '@testing-library/react-native';

import * as aiApi from '../../../api/ai';
import { ApiError } from '../../../api/client';
import * as scheduleApi from '../../../api/schedule';
import { AI_DEMO_TEXT } from '../../../utils/ai';
import { showToast } from '../../../utils/toast';
import { OcrReviewScreen } from '../OcrReviewScreen';

jest.mock('../../../api/ai');
jest.mock('../../../api/schedule');
jest.mock('../../../utils/toast', () => ({ showToast: jest.fn() }));

const mockedAi = aiApi as jest.Mocked<typeof aiApi>;
const mockedSchedule = scheduleApi as jest.Mocked<typeof scheduleApi>;
const IMAGE = { uri: 'file:///horario.jpg', mimeType: 'image/jpeg', fileName: 'horario.jpg' };
const navigation = { goBack: jest.fn() } as any;
const route = { key: 'k', name: 'OcrReview', params: { image: IMAGE } } as any;
const renderScreen = () => render(<OcrReviewScreen navigation={navigation} route={route} />);

const block = (over: Partial<TimeBlockInput>): TimeBlockInput => ({
  label: 'Cálculo', type: 'CLASE', startTime: '08:00', endTime: '10:00', isRecurring: true, dayOfWeek: 1, date: null, ...over,
});
const saveButton = () => screen.getByRole('button', { name: 'Añadir a mi horario' });
// Elige la hora con el reloj nativo (mockeado en jest.setup.ts): ya no se escribe con el teclado.
const pickTime = async (label: string, hours: number, minutes: number) => {
  await fireEvent.press(await screen.findByLabelText(label));
  await fireEvent(screen.getByTestId('datetimepicker-time'), 'valueChange', { nativeEvent: {} }, new Date(2026, 8, 29, hours, minutes));
};

beforeEach(() => {
  jest.clearAllMocks();
  mockedAi.getAiStatus.mockResolvedValue({ provider: 'gemini' });
});

it('muestra «Leyendo tu horario» mientras la IA lee la foto y después los bloques', async () => {
  let resolve!: (value: { blocks: TimeBlockInput[] }) => void;
  mockedAi.scanSchedule.mockReturnValue(new Promise((r) => (resolve = r)));
  await renderScreen();
  expect(screen.getByText('Leyendo tu horario')).toBeTruthy();
  expect(screen.getByText('Puede tardar unos segundos. No cierres la pantalla.')).toBeTruthy();
  expect(mockedAi.scanSchedule).toHaveBeenCalledWith(IMAGE);

  await act(async () => resolve({ blocks: [block({}), block({ label: 'Física', dayOfWeek: 3, startTime: '10:00', endTime: '12:00' })] }));
  expect(screen.getByText('2 bloques detectados')).toBeTruthy();
  expect(screen.getByText('Revísalos antes de confirmar: se sumarán a tu horario y afectarán a los huecos que vean tus grupos.')).toBeTruthy();
  expect(screen.getByLabelText('Nombre del bloque 1').props.value).toBe('Cálculo');
  expect(screen.getByLabelText('Nombre del bloque 2').props.value).toBe('Física');
});

it('se pueden corregir y quitar bloques; guarda solo lo que queda y vuelve a «Mi horario»', async () => {
  mockedAi.scanSchedule.mockResolvedValue({ blocks: [block({}), block({ label: 'Física', dayOfWeek: 3, startTime: '10:00', endTime: '12:00' })] });
  mockedSchedule.createTimeBlocksBulk.mockResolvedValue([{ ...block({ label: 'Cálculo I', dayOfWeek: 2 }), id: 'b1', userId: 'u1' }]);
  await renderScreen();

  await fireEvent.changeText(await screen.findByLabelText('Nombre del bloque 1'), '  Cálculo I ');
  await fireEvent.press(screen.getByLabelText('Bloque 1: martes'));
  await pickTime('Inicio del bloque 1', 8, 30);
  await fireEvent.press(screen.getByLabelText('Quitar bloque 2'));
  expect(screen.getByText('1 bloque detectado')).toBeTruthy();
  expect(screen.queryByDisplayValue('Física')).toBeNull();

  await fireEvent.press(saveButton());
  await waitFor(() => expect(navigation.goBack).toHaveBeenCalled());
  expect(mockedSchedule.createTimeBlocksBulk).toHaveBeenCalledWith([
    { label: 'Cálculo I', type: 'CLASE', startTime: '08:30', endTime: '10:00', isRecurring: true, dayOfWeek: 2, date: null },
  ]);
  expect(showToast).toHaveBeenCalledWith('Se añadió 1 bloque a tu horario.');
});

it('guarda: con una hora inválida o un nombre vacío no guarda; control positivo al corregirlos', async () => {
  mockedAi.scanSchedule.mockResolvedValue({ blocks: [block({})] });
  mockedSchedule.createTimeBlocksBulk.mockResolvedValue([]);
  await renderScreen();

  await pickTime('Fin del bloque 1', 7, 0);
  expect(screen.getByText('Debe ser posterior')).toBeTruthy();
  await fireEvent.changeText(screen.getByLabelText('Nombre del bloque 1'), '   ');
  expect(screen.getByText('El nombre es requerido')).toBeTruthy();
  expect(saveButton().props.accessibilityState.disabled).toBe(true);
  await fireEvent.press(saveButton());
  expect(mockedSchedule.createTimeBlocksBulk).not.toHaveBeenCalled();

  await pickTime('Fin del bloque 1', 10, 0);
  await fireEvent.changeText(screen.getByLabelText('Nombre del bloque 1'), 'Cálculo');
  await fireEvent.press(saveButton());
  await waitFor(() => expect(mockedSchedule.createTimeBlocksBulk).toHaveBeenCalledTimes(1));
});

it('una hora mal leída por la IA se marca en rojo y se corrige con el reloj', async () => {
  mockedAi.scanSchedule.mockResolvedValue({ blocks: [block({ startTime: '8:5' })] });
  mockedSchedule.createTimeBlocksBulk.mockResolvedValue([]);
  await renderScreen();
  expect(await screen.findByText('8:5')).toBeTruthy();
  expect(screen.getByText('Formato HH:mm')).toBeTruthy();
  expect(saveButton().props.accessibilityState.disabled).toBe(true);

  await pickTime('Inicio del bloque 1', 8, 5);
  expect(screen.getByText('08:05')).toBeTruthy();
  expect(screen.queryByText('Formato HH:mm')).toBeNull();
  await fireEvent.press(saveButton());
  await waitFor(() => expect(mockedSchedule.createTimeBlocksBulk).toHaveBeenCalledWith([expect.objectContaining({ startTime: '08:05' })]));
});

it('los chips de día y los controles nombran su bloque (accesibilidad)', async () => {
  mockedAi.scanSchedule.mockResolvedValue({ blocks: [block({}), block({ label: 'Física', dayOfWeek: 3 })] });
  await renderScreen();
  expect(await screen.findByLabelText('Bloque 2: miércoles')).toBeTruthy();
  expect(screen.getByLabelText('Bloque 1: lunes')).toBeTruthy();
  expect(screen.getByLabelText('Quitar bloque 2')).toBeTruthy();
  expect(screen.getByLabelText('Inicio del bloque 2')).toBeTruthy();
});

it('si se quitan todos, no deja guardar y lo explica', async () => {
  mockedAi.scanSchedule.mockResolvedValue({ blocks: [block({})] });
  await renderScreen();
  await fireEvent.press(await screen.findByLabelText('Quitar bloque 1'));
  expect(screen.getByText('Quitaste todos los bloques. Vuelve a escanear o añádelos a mano.')).toBeTruthy();
  expect(saveButton().props.accessibilityState.disabled).toBe(true);
});

it('«Descartar» vuelve atrás sin guardar', async () => {
  mockedAi.scanSchedule.mockResolvedValue({ blocks: [block({})] });
  await renderScreen();
  await fireEvent.press(await screen.findByText('Descartar'));
  expect(navigation.goBack).toHaveBeenCalled();
  expect(mockedSchedule.createTimeBlocksBulk).not.toHaveBeenCalled();
});

it('mientras guarda, «Descartar» está desactivado; al terminar vuelve atrás una sola vez', async () => {
  let resolve!: (value: Awaited<ReturnType<typeof scheduleApi.createTimeBlocksBulk>>) => void;
  mockedAi.scanSchedule.mockResolvedValue({ blocks: [block({})] });
  mockedSchedule.createTimeBlocksBulk.mockReturnValue(new Promise((r) => (resolve = r)));
  await renderScreen();
  const discard = () => screen.getByRole('button', { name: 'Descartar' });
  expect((await screen.findByRole('button', { name: 'Descartar' })).props.accessibilityState.disabled).toBe(false);

  await fireEvent.press(saveButton());
  expect(discard().props.accessibilityState.disabled).toBe(true);
  await fireEvent.press(discard());
  expect(navigation.goBack).not.toHaveBeenCalled();

  await act(async () => resolve([]));
  expect(navigation.goBack).toHaveBeenCalledTimes(1);
});

it('si la pantalla se cierra mientras guarda, al terminar no vuelve atrás ni avisa (control positivo arriba)', async () => {
  let resolve!: (value: Awaited<ReturnType<typeof scheduleApi.createTimeBlocksBulk>>) => void;
  mockedAi.scanSchedule.mockResolvedValue({ blocks: [block({})] });
  mockedSchedule.createTimeBlocksBulk.mockReturnValue(new Promise((r) => (resolve = r)));
  const { unmount } = await renderScreen();
  await fireEvent.press(await screen.findByRole('button', { name: 'Añadir a mi horario' }));
  expect(mockedSchedule.createTimeBlocksBulk).toHaveBeenCalledTimes(1);
  await unmount();
  await act(async () => resolve([]));
  expect(navigation.goBack).not.toHaveBeenCalled();
  expect(showToast).not.toHaveBeenCalled();
});

it('si el servidor rechaza el guardado, muestra el error y se queda', async () => {
  mockedAi.scanSchedule.mockResolvedValue({ blocks: [block({})] });
  mockedSchedule.createTimeBlocksBulk.mockRejectedValue(new ApiError(0, 'NETWORK_ERROR', 'No se pudo conectar con el servidor. Revisa tu conexión.'));
  await renderScreen();
  await fireEvent.press(await screen.findByText('Añadir a mi horario'));
  expect(await screen.findByText('No se pudo conectar con el servidor. Revisa tu conexión.')).toBeTruthy();
  expect(navigation.goBack).not.toHaveBeenCalled();
});

it('sin bloques: «No se detectó ningún bloque» y «Volver»', async () => {
  mockedAi.scanSchedule.mockResolvedValue({ blocks: [] });
  await renderScreen();
  expect(await screen.findByText('No se detectó ningún bloque')).toBeTruthy();
  expect(screen.getByText('Prueba con una foto más nítida o añade los bloques a mano.')).toBeTruthy();
  await fireEvent.press(screen.getByText('Volver'));
  expect(navigation.goBack).toHaveBeenCalled();
});

it('si la IA falla: el motivo, «Reintentar» y «Volver»', async () => {
  mockedAi.scanSchedule
    .mockRejectedValueOnce(new ApiError(503, 'AI_UNAVAILABLE', 'La IA no está disponible en este momento. Inténtalo en unos minutos.'))
    .mockResolvedValueOnce({ blocks: [block({})] });
  await renderScreen();
  expect(await screen.findByText('No se pudo leer el horario')).toBeTruthy();
  expect(screen.getByText('La IA no está disponible en este momento. Inténtalo en unos minutos.')).toBeTruthy();
  await fireEvent.press(screen.getByText('Reintentar'));
  expect(await screen.findByText('1 bloque detectado')).toBeTruthy();
  expect(mockedAi.scanSchedule).toHaveBeenCalledTimes(2);
});

it('en modo demostración lo avisa', async () => {
  mockedAi.getAiStatus.mockResolvedValue({ provider: 'mock' });
  mockedAi.scanSchedule.mockResolvedValue({ blocks: [block({})] });
  await renderScreen();
  expect(await screen.findByText(AI_DEMO_TEXT)).toBeTruthy();
});
