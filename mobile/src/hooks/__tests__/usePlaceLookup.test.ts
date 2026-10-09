import { act, renderHook } from '@testing-library/react-native';
import * as ExpoLocation from 'expo-location';

import { PLACE_MESSAGES, usePlaceLookup } from '../usePlaceLookup';

const location = jest.mocked(ExpoLocation);
const granted = () => location.requestForegroundPermissionsAsync.mockResolvedValue({ granted: true, canAskAgain: true } as any);

beforeEach(() => jest.clearAllMocks());

it('buscar: pide permiso, geocodifica y devuelve el primer resultado con el texto buscado como nombre', async () => {
  granted();
  location.geocodeAsync.mockResolvedValue([{ latitude: -12.07, longitude: -77.08 } as any, { latitude: 1, longitude: 1 } as any]);
  const { result } = await renderHook(() => usePlaceLookup());
  let found: unknown;
  await act(async () => {
    found = await result.current.search('  Biblioteca Central PUCP ');
  });
  expect(location.geocodeAsync).toHaveBeenCalledWith('Biblioteca Central PUCP');
  expect(found).toEqual({ name: 'Biblioteca Central PUCP', latitude: -12.07, longitude: -77.08 });
  expect(result.current.error).toBeNull();
});

it('buscar sin resultados: null y un mensaje que sugiere tocar el mapa', async () => {
  granted();
  location.geocodeAsync.mockResolvedValue([]);
  const { result } = await renderHook(() => usePlaceLookup());
  await act(async () => {
    expect(await result.current.search('zzzz')).toBeNull();
  });
  expect(result.current.error).toBe(PLACE_MESSAGES.notFound);
});

it('buscar sin permiso: no geocodifica y lo explica (en Android, buscar direcciones exige el permiso de ubicación)', async () => {
  location.requestForegroundPermissionsAsync.mockResolvedValue({ granted: false, canAskAgain: true } as any);
  const { result } = await renderHook(() => usePlaceLookup());
  await act(async () => {
    expect(await result.current.search('Lima')).toBeNull();
  });
  expect(location.geocodeAsync).not.toHaveBeenCalled();
  expect(result.current.error).toBe(PLACE_MESSAGES.denied);
});

it('buscar un texto vacío no hace nada', async () => {
  const { result } = await renderHook(() => usePlaceLookup());
  await act(async () => {
    expect(await result.current.search('   ')).toBeNull();
  });
  expect(location.requestForegroundPermissionsAsync).not.toHaveBeenCalled();
});

it('nombrar un punto del mapa: dirección legible, o las coordenadas si no hay permiso o el geocodificador falla', async () => {
  granted();
  location.reverseGeocodeAsync.mockResolvedValueOnce([{ street: 'Av. Universitaria', streetNumber: '1801', district: 'San Miguel' } as any]);
  const { result } = await renderHook(() => usePlaceLookup());
  await act(async () => {
    expect(await result.current.nameAt(-12.07, -77.08)).toBe('Av. Universitaria 1801, San Miguel');
  });

  location.reverseGeocodeAsync.mockRejectedValueOnce(new Error('sin red'));
  await act(async () => {
    expect(await result.current.nameAt(-12.07, -77.08)).toBe('Ubicación (-12.07000, -77.08000)');
  });

  location.requestForegroundPermissionsAsync.mockResolvedValueOnce({ granted: false, canAskAgain: true } as any);
  await act(async () => {
    expect(await result.current.nameAt(-12.07, -77.08)).toBe('Ubicación (-12.07000, -77.08000)');
  });
});
