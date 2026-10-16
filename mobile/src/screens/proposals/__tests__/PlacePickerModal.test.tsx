import { fireEvent, render, screen, waitFor } from '@testing-library/react-native';

import { PlacePickerModal } from '../PlacePickerModal';

const mockSearch = jest.fn();
const mockNameAt = jest.fn();
let mockError: string | null = null;
jest.mock('../../../hooks/usePlaceLookup', () => ({
  usePlaceLookup: () => ({ search: mockSearch, nameAt: mockNameAt, searching: false, error: mockError, clearError: jest.fn() }),
}));

// El mapa (OsmMap) se prueba en OsmMap.test.tsx: aquí es un View con sus props, y animateTo se registra en mockAnimateTo.
const mockAnimateTo = jest.fn();
jest.mock('../../../components/OsmMap', () => {
  const { createElement, forwardRef, useImperativeHandle } = require('react');
  const { View } = require('react-native');
  const OsmMap = forwardRef((props: Record<string, unknown>, ref: unknown) => {
    useImperativeHandle(ref, () => ({ animateTo: mockAnimateTo }));
    return createElement(View, { ...props, testID: 'map' });
  });
  return { OsmMap, PIN_ZOOM: 16 };
});

const point = (latitude: number, longitude: number) => ({ latitude, longitude });
const marker = () => screen.getByTestId('map').props.marker;
const useButton = () => screen.getByRole('button', { name: 'Usar este lugar' });

beforeEach(() => {
  jest.clearAllMocks();
  mockError = null;
});

it('sin lugar previo: el mapa abre en Lima, sin pin, y «Usar este lugar» está desactivado', async () => {
  await render(<PlacePickerModal initial={null} onPick={jest.fn()} onDismiss={jest.fn()} />);
  expect(screen.getByTestId('map').props.initialCenter).toEqual({ latitude: -12.0464, longitude: -77.0428 });
  expect(marker()).toBeNull();
  expect(useButton().props.accessibilityState.disabled).toBe(true);
});

it('con un lugar previo: abre centrado en él con el pin puesto', async () => {
  await render(<PlacePickerModal initial={{ name: 'Biblioteca', latitude: -12.07, longitude: -77.08 }} onPick={jest.fn()} onDismiss={jest.fn()} />);
  expect(screen.getByTestId('map').props.initialCenter).toMatchObject({ latitude: -12.07, longitude: -77.08 });
  expect(screen.getByTestId('map').props.initialZoom).toBe(16);
  expect(marker()).toMatchObject({ latitude: -12.07, longitude: -77.08 });
  expect(screen.getByText('Biblioteca')).toBeTruthy();
});

it('tocar el mapa pone el pin, nombra el punto y «Usar este lugar» lo devuelve con sus coordenadas', async () => {
  mockNameAt.mockResolvedValue('Av. Universitaria 1801, San Miguel');
  const onPick = jest.fn();
  await render(<PlacePickerModal initial={null} onPick={onPick} onDismiss={jest.fn()} />);
  await fireEvent(screen.getByTestId('map'), 'press', point(-12.07, -77.08));
  expect(await screen.findByText('Av. Universitaria 1801, San Miguel')).toBeTruthy();
  expect(mockNameAt).toHaveBeenCalledWith(-12.07, -77.08);
  await fireEvent.press(useButton());
  expect(onPick).toHaveBeenCalledWith({ name: 'Av. Universitaria 1801, San Miguel', latitude: -12.07, longitude: -77.08 });
});

it('arrastrar el pin cambia el punto y su nombre', async () => {
  mockNameAt.mockResolvedValueOnce('Primer punto').mockResolvedValueOnce('Punto ajustado');
  const onPick = jest.fn();
  await render(<PlacePickerModal initial={null} onPick={onPick} onDismiss={jest.fn()} />);
  await fireEvent(screen.getByTestId('map'), 'press', point(-12.07, -77.08));
  await screen.findByText('Primer punto');
  await fireEvent(screen.getByTestId('map'), 'markerDragEnd', point(-12.1, -77.1));
  expect(await screen.findByText('Punto ajustado')).toBeTruthy();
  await fireEvent.press(useButton());
  expect(onPick).toHaveBeenCalledWith({ name: 'Punto ajustado', latitude: -12.1, longitude: -77.1 });
});

it('buscar una dirección mueve el mapa y el pin al resultado, con el texto buscado como nombre', async () => {
  mockSearch.mockResolvedValue({ name: 'Biblioteca Central PUCP', latitude: -12.069, longitude: -77.079 });
  const onPick = jest.fn();
  await render(<PlacePickerModal initial={null} onPick={onPick} onDismiss={jest.fn()} />);
  await fireEvent.changeText(screen.getByLabelText('Buscar dirección o lugar'), 'Biblioteca Central PUCP');
  await fireEvent.press(screen.getByRole('button', { name: 'Buscar' }));
  await waitFor(() => expect(mockAnimateTo).toHaveBeenCalledWith(expect.objectContaining({ latitude: -12.069, longitude: -77.079 })));
  expect(mockSearch).toHaveBeenCalledWith('Biblioteca Central PUCP');
  expect(marker()).toMatchObject({ latitude: -12.069, longitude: -77.079 });
  await fireEvent.press(useButton());
  expect(onPick).toHaveBeenCalledWith({ name: 'Biblioteca Central PUCP', latitude: -12.069, longitude: -77.079 });
});

it('muestra el error del buscador (p. ej. sin resultados)', async () => {
  mockError = 'No encontramos esa dirección.';
  await render(<PlacePickerModal initial={null} onPick={jest.fn()} onDismiss={jest.fn()} />);
  expect(screen.getByText('No encontramos esa dirección.')).toBeTruthy();
});

it('cerrar no elige nada', async () => {
  const onPick = jest.fn();
  const onDismiss = jest.fn();
  await render(<PlacePickerModal initial={null} onPick={onPick} onDismiss={onDismiss} />);
  await fireEvent.press(screen.getByRole('button', { name: 'Cerrar' }));
  expect(onDismiss).toHaveBeenCalled();
  expect(onPick).not.toHaveBeenCalled();
});
