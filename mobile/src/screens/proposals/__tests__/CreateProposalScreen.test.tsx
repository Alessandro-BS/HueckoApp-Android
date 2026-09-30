import { act, fireEvent, render, screen, waitFor } from '@testing-library/react-native';
import { Linking } from 'react-native';

import { ApiError } from '../../../api/client';
import * as aiApi from '../../../api/ai';
import * as proposalsApi from '../../../api/proposals';
import { makeDraft, makeProposal } from '../../../testing/fixtures';
import { showToast } from '../../../utils/toast';
import { CreateProposalScreen } from '../CreateProposalScreen';

jest.mock('../../../api/proposals');
jest.mock('../../../api/ai');
jest.mock('../../../utils/toast', () => ({ showToast: jest.fn() }));
jest.mock('../../../utils/clock', () => ({ today: () => new Date(2026, 8, 29, 10, 0) }));
const mockLocate = jest.fn();
let mockLocationState = { error: null as string | null, canOpenSettings: false };
jest.mock('../../../hooks/useCurrentLocation', () => ({
  useCurrentLocation: () => ({
    locate: mockLocate,
    locating: false,
    error: mockLocationState.error,
    canOpenSettings: mockLocationState.canOpenSettings,
    clearError: () => {},
  }),
}));

const mocked = proposalsApi as jest.Mocked<typeof proposalsApi>;
const mockedAi = aiApi as jest.Mocked<typeof aiApi>;
const navigation = { goBack: jest.fn() } as any;
const route = { key: 'k', name: 'CreateProposal', params: { groupId: 'g1', groupName: 'Proyecto Integrador' } } as any;
const renderScreen = () => render(<CreateProposalScreen navigation={navigation} route={route} />);

// Elige fecha y hora en los dos pasos del selector nativo (mockeado en jest.setup.ts).
const pickDeadline = async (date: Date) => {
  await fireEvent.press(screen.getByLabelText('Fecha límite de votación'));
  await fireEvent(screen.getByTestId('datetimepicker-date'), 'change', { type: 'set' }, date);
  await fireEvent(screen.getByTestId('datetimepicker-time'), 'change', { type: 'set' }, date);
};

beforeEach(() => {
  jest.clearAllMocks();
  mockLocationState = { error: null, canOpenSettings: false };
  mocked.createProposal.mockResolvedValue(makeProposal());
});

it('crea con «las 3 mejores» por defecto, con el título recortado, y vuelve atrás', async () => {
  await renderScreen();
  expect(screen.getByText('Para «Proyecto Integrador»')).toBeTruthy();
  await fireEvent.changeText(screen.getByLabelText('Título del plan'), '  Repaso antes de la entrega ');
  await fireEvent.changeText(screen.getByLabelText('Lugar (opcional)'), 'Google Meet');
  await pickDeadline(new Date(2026, 9, 2, 20, 0));
  expect(screen.getByText('Vie 2 oct, 20:00')).toBeTruthy();
  await fireEvent.press(screen.getByText('Crear propuesta'));

  await waitFor(() => expect(navigation.goBack).toHaveBeenCalled());
  expect(mocked.createProposal).toHaveBeenCalledWith('g1', {
    title: 'Repaso antes de la entrega',
    location: { name: 'Google Meet', latitude: null, longitude: null },
    votingDeadline: new Date(2026, 9, 2, 20, 0).toISOString(),
    windows: [],
  });
  expect(showToast).toHaveBeenCalledWith('Propuesta creada.');
});

it('«Usar mi ubicación actual» rellena el lugar con coordenadas', async () => {
  mockLocate.mockResolvedValue({ name: 'Biblioteca Central, San Miguel', latitude: -12.07, longitude: -77.08 });
  await renderScreen();
  await fireEvent.changeText(screen.getByLabelText('Título del plan'), 'Estudiar');
  await pickDeadline(new Date(2026, 9, 2, 20, 0));
  await fireEvent.press(screen.getByText('Usar mi ubicación actual'));
  await waitFor(() => expect(screen.getByLabelText('Lugar (opcional)').props.value).toBe('Biblioteca Central, San Miguel'));
  expect(screen.getByText('Con coordenadas: se podrá abrir en el mapa.')).toBeTruthy();
  await fireEvent.press(screen.getByText('Crear propuesta'));
  await waitFor(() => expect(mocked.createProposal).toHaveBeenCalledTimes(1));
  expect(mocked.createProposal.mock.calls[0][1].location).toEqual({ name: 'Biblioteca Central, San Miguel', latitude: -12.07, longitude: -77.08 });
});

it('escribir el lugar a mano descarta las coordenadas', async () => {
  mockLocate.mockResolvedValue({ name: 'Biblioteca Central, San Miguel', latitude: -12.07, longitude: -77.08 });
  await renderScreen();
  await fireEvent.changeText(screen.getByLabelText('Título del plan'), 'Estudiar');
  await pickDeadline(new Date(2026, 9, 2, 20, 0));
  await fireEvent.press(screen.getByText('Usar mi ubicación actual'));
  await waitFor(() => expect(screen.getByLabelText('Lugar (opcional)').props.value).toBe('Biblioteca Central, San Miguel'));
  await fireEvent.changeText(screen.getByLabelText('Lugar (opcional)'), 'Biblioteca Central');
  await fireEvent.press(screen.getByText('Crear propuesta'));
  await waitFor(() => expect(mocked.createProposal).toHaveBeenCalledTimes(1));
  expect(mocked.createProposal.mock.calls[0][1].location).toEqual({ name: 'Biblioteca Central', latitude: null, longitude: null });
});

it('la ubicación solo se pide al pulsar el botón, no al abrir la pantalla', async () => {
  await renderScreen();
  expect(mockLocate).not.toHaveBeenCalled();
});

it('permiso denegado para siempre: «Abrir ajustes» abre los ajustes; si se puede volver a pedir, no aparece', async () => {
  const openSettings = jest.spyOn(Linking, 'openSettings').mockResolvedValue(undefined);
  mockLocationState = { error: 'Sin permiso de ubicación.', canOpenSettings: false };
  const { rerender } = await renderScreen();
  expect(screen.getByText('Sin permiso de ubicación.')).toBeTruthy();
  expect(screen.queryByText('Abrir ajustes')).toBeNull();

  mockLocationState = { error: 'Sin permiso de ubicación.', canOpenSettings: true };
  await rerender(<CreateProposalScreen navigation={navigation} route={route} />);
  await fireEvent.press(screen.getByText('Abrir ajustes'));
  expect(openSettings).toHaveBeenCalledTimes(1);
  openSettings.mockRestore();
});

it('guarda: con el plazo en el pasado no envía desde el teclado; control positivo con un plazo futuro', async () => {
  await renderScreen();
  await fireEvent.changeText(screen.getByLabelText('Título del plan'), 'Estudiar');
  await pickDeadline(new Date(2026, 8, 29, 9, 0));
  expect(screen.getByText('La fecha límite debe ser futura')).toBeTruthy();
  await fireEvent(screen.getByLabelText('Título del plan'), 'submitEditing');
  expect(mocked.createProposal).not.toHaveBeenCalled();

  await pickDeadline(new Date(2026, 9, 2, 20, 0));
  await fireEvent(screen.getByLabelText('Título del plan'), 'submitEditing');
  await waitFor(() => expect(mocked.createProposal).toHaveBeenCalledTimes(1));
});

it('franjas elegidas a mano: valida las horas, no las repite y las envía', async () => {
  await renderScreen();
  await fireEvent.changeText(screen.getByLabelText('Título del plan'), 'Estudiar');
  await pickDeadline(new Date(2026, 9, 2, 20, 0));
  await fireEvent.press(screen.getByText('Elegir yo las franjas'));
  // Guarda: sin ninguna franja no se envía.
  await fireEvent(screen.getByLabelText('Título del plan'), 'submitEditing');
  expect(mocked.createProposal).not.toHaveBeenCalled();

  await fireEvent.changeText(screen.getByLabelText('Hora de fin (HH:mm)'), '08:00');
  expect(screen.getByText('Debe ser posterior')).toBeTruthy();
  await fireEvent(screen.getByLabelText('Hora de fin (HH:mm)'), 'submitEditing');
  expect(screen.queryByText('Lun · 09:00 - 08:00')).toBeNull();

  await fireEvent.changeText(screen.getByLabelText('Hora de fin (HH:mm)'), '11:00');
  await fireEvent.press(screen.getByText('Añadir franja'));
  expect(screen.getByText('Lun · 09:00 - 11:00')).toBeTruthy();
  expect(screen.getByText('Esa franja ya está en la lista.')).toBeTruthy();
  await fireEvent.press(screen.getByText('Vie'));
  await fireEvent.press(screen.getByText('Añadir franja'));
  expect(screen.getByText('Vie · 09:00 - 11:00')).toBeTruthy();

  await fireEvent.press(screen.getByText('Crear propuesta'));
  await waitFor(() => expect(mocked.createProposal).toHaveBeenCalledTimes(1));
  expect(mocked.createProposal.mock.calls[0][1].windows).toEqual([
    { dayOfWeek: 1, startTime: '09:00', endTime: '11:00' },
    { dayOfWeek: 5, startTime: '09:00', endTime: '11:00' },
  ]);
});

it('muestra el error del servidor y se queda en la pantalla', async () => {
  mocked.createProposal.mockRejectedValue(new ApiError(403, 'NOT_A_MEMBER', 'No perteneces a este grupo.'));
  await renderScreen();
  await fireEvent.changeText(screen.getByLabelText('Título del plan'), 'Estudiar');
  await pickDeadline(new Date(2026, 9, 2, 20, 0));
  await fireEvent.press(screen.getByText('Crear propuesta'));
  expect(await screen.findByText('No perteneces a este grupo.')).toBeTruthy();
  expect(navigation.goBack).not.toHaveBeenCalled();
});

const routeWith = (prefill: object) => ({ ...route, params: { ...route.params, prefill } }) as any;

it('abre rellenada con una idea de la IA y la envía con su franja', async () => {
  const prefill = {
    title: 'Partido de fulbito', placeName: 'Losa del campus', window: { dayOfWeek: 4, startTime: '08:00', endTime: '20:00' },
    votingDeadline: null, category: 'DEPORTE',
  };
  await render(<CreateProposalScreen navigation={navigation} route={routeWith(prefill)} />);
  expect(screen.getByLabelText('Título del plan').props.value).toBe('Partido de fulbito');
  expect(screen.getByLabelText('Lugar (opcional)').props.value).toBe('Losa del campus');
  expect(screen.getByText('Jue · 08:00 - 20:00')).toBeTruthy();
  expect(screen.getByText('Categoría sugerida: Deporte')).toBeTruthy();

  await pickDeadline(new Date(2026, 9, 2, 20, 0));
  await fireEvent.press(screen.getByText('Crear propuesta'));
  await waitFor(() => expect(mocked.createProposal).toHaveBeenCalledTimes(1));
  expect(mocked.createProposal.mock.calls[0][1]).toEqual({
    title: 'Partido de fulbito',
    location: { name: 'Losa del campus', latitude: null, longitude: null },
    votingDeadline: new Date(2026, 9, 2, 20, 0).toISOString(),
    windows: [{ dayOfWeek: 4, startTime: '08:00', endTime: '20:00' }],
  });
});

it('«Rellenar con IA» pide un borrador y rellena título, lugar, plazo y franja', async () => {
  mockedAi.draftProposal.mockResolvedValue(makeDraft());
  await renderScreen();
  await fireEvent.changeText(screen.getByLabelText('Describe tu plan'), '  Estudiar el martes en la biblioteca ');
  await fireEvent.press(screen.getByText('Rellenar con IA'));

  await waitFor(() => expect(screen.getByLabelText('Título del plan').props.value).toBe('Estudiar para el parcial'));
  expect(mockedAi.draftProposal).toHaveBeenCalledWith('g1', 'Estudiar el martes en la biblioteca');
  expect(screen.getByLabelText('Lugar (opcional)').props.value).toBe('Biblioteca central');
  expect(screen.getByText('Mié 30 sep, 10:00')).toBeTruthy();
  expect(screen.getByText('Mar · 08:00 - 20:00')).toBeTruthy();
  expect(screen.getByText('Categoría sugerida: Estudio')).toBeTruthy();
  expect(showToast).toHaveBeenCalledWith('Borrador listo: revísalo antes de crear la propuesta.');

  await fireEvent.press(screen.getByText('Crear propuesta'));
  await waitFor(() => expect(mocked.createProposal).toHaveBeenCalledTimes(1));
  expect(mocked.createProposal.mock.calls[0][1]).toEqual({
    title: 'Estudiar para el parcial',
    location: { name: 'Biblioteca central', latitude: null, longitude: null },
    votingDeadline: new Date(2026, 8, 30, 10, 0).toISOString(),
    windows: [{ dayOfWeek: 2, startTime: '08:00', endTime: '20:00' }],
  });
});

it('un borrador sin franja deja «las 3 mejores»', async () => {
  mockedAi.draftProposal.mockResolvedValue(makeDraft({ window: null, placeName: null }));
  await renderScreen();
  await fireEvent.changeText(screen.getByLabelText('Describe tu plan'), 'Algo tranqui');
  await fireEvent.press(screen.getByText('Rellenar con IA'));
  await waitFor(() => expect(screen.getByLabelText('Título del plan').props.value).toBe('Estudiar para el parcial'));
  expect(screen.getByText('Huecko elegirá las 3 franjas en las que más gente del grupo está libre.')).toBeTruthy();
  expect(screen.getByLabelText('Lugar (opcional)').props.value).toBe('');
});

it('si la IA falla muestra el motivo y no toca el formulario', async () => {
  mockedAi.draftProposal.mockRejectedValue(new ApiError(503, 'AI_UNAVAILABLE', 'La IA no está disponible en este momento. Inténtalo en unos minutos.'));
  await renderScreen();
  await fireEvent.changeText(screen.getByLabelText('Título del plan'), 'Mi título');
  await fireEvent.changeText(screen.getByLabelText('Describe tu plan'), 'Estudiar');
  await fireEvent.press(screen.getByText('Rellenar con IA'));
  expect(await screen.findByText('La IA no está disponible en este momento. Inténtalo en unos minutos.')).toBeTruthy();
  expect(screen.getByLabelText('Título del plan').props.value).toBe('Mi título');
});

it('guarda: con menos de 3 caracteres no pide borrador; control positivo con 3', async () => {
  mockedAi.draftProposal.mockResolvedValue(makeDraft());
  await renderScreen();
  await fireEvent.changeText(screen.getByLabelText('Describe tu plan'), ' ab ');
  await fireEvent.press(screen.getByText('Rellenar con IA'));
  expect(mockedAi.draftProposal).not.toHaveBeenCalled();

  await fireEvent.changeText(screen.getByLabelText('Describe tu plan'), 'abc');
  await fireEvent.press(screen.getByText('Rellenar con IA'));
  await waitFor(() => expect(mockedAi.draftProposal).toHaveBeenCalledWith('g1', 'abc'));
});

it('un borrador con plazo pasado sigue pasando por la validación del formulario', async () => {
  mockedAi.draftProposal.mockResolvedValue(makeDraft({ votingDeadline: new Date(2026, 8, 1, 10, 0).toISOString() }));
  await renderScreen();
  await fireEvent.changeText(screen.getByLabelText('Describe tu plan'), 'Estudiar');
  await fireEvent.press(screen.getByText('Rellenar con IA'));
  await waitFor(() => expect(screen.getByLabelText('Título del plan').props.value).toBe('Estudiar para el parcial'));
  expect(screen.getByText('La fecha límite debe ser futura')).toBeTruthy();
  await fireEvent.press(screen.getByText('Crear propuesta'));
  expect(mocked.createProposal).not.toHaveBeenCalled();
});

const NO_WINDOW_HINT = 'Huecko IA no eligió franja: añade una a mano (o deja que Huecko elija si el grupo tiene huecos en común).';

it('avisa en «Franjas» solo si la IA no encontró hueco (control positivo y negativos)', async () => {
  const base = { title: 'Algo', placeName: null, votingDeadline: null, category: 'OTRO' };
  const { unmount } = await render(<CreateProposalScreen navigation={navigation} route={routeWith({ ...base, window: null })} />);
  expect(screen.getByText(NO_WINDOW_HINT)).toBeTruthy();
  await unmount();

  const withWindow = { ...base, window: { dayOfWeek: 4, startTime: '08:00', endTime: '20:00' } };
  const second = await render(<CreateProposalScreen navigation={navigation} route={routeWith(withWindow)} />);
  expect(screen.queryByText(NO_WINDOW_HINT)).toBeNull();
  await second.unmount();

  await renderScreen();
  expect(screen.queryByText(NO_WINDOW_HINT)).toBeNull();
});

it('un borrador sin franja muestra el aviso', async () => {
  mockedAi.draftProposal.mockResolvedValue(makeDraft({ window: null }));
  await renderScreen();
  await fireEvent.changeText(screen.getByLabelText('Describe tu plan'), 'Algo tranqui');
  await fireEvent.press(screen.getByText('Rellenar con IA'));
  expect(await screen.findByText(NO_WINDOW_HINT)).toBeTruthy();
});

it('si se sale de la pantalla mientras el borrador está pendiente, no se aplica ni avisa', async () => {
  let resolve: (d: ReturnType<typeof makeDraft>) => void = () => {};
  mockedAi.draftProposal.mockReturnValue(new Promise((r) => { resolve = r; }));
  const view = await renderScreen();
  await fireEvent.changeText(screen.getByLabelText('Describe tu plan'), 'Estudiar');
  await fireEvent.press(screen.getByText('Rellenar con IA'));
  await view.unmount();
  await act(async () => resolve(makeDraft()));
  expect(showToast).not.toHaveBeenCalled();
});

it('en «las 3 mejores», si el grupo no tiene huecos en común muestra el 409 del servidor y se queda', async () => {
  const message = 'El grupo no tiene huecos en común esta semana: elige las franjas a mano.';
  mocked.createProposal.mockRejectedValue(new ApiError(409, 'NO_COMMON_WINDOWS', message));
  await renderScreen();
  await fireEvent.changeText(screen.getByLabelText('Título del plan'), 'Repaso');
  await pickDeadline(new Date(2026, 9, 2, 20, 0));
  await fireEvent.press(screen.getByText('Crear propuesta'));
  expect(await screen.findByText(message)).toBeTruthy();
  expect(navigation.goBack).not.toHaveBeenCalled();
  expect(showToast).not.toHaveBeenCalled();
});
