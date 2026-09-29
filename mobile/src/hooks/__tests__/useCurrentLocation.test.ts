import type { Location } from '@hueckoapp/shared';
import { act, renderHook } from '@testing-library/react-native';
import * as ExpoLocation from 'expo-location';

import { LOCATION_MESSAGES, useCurrentLocation } from '../useCurrentLocation';

// expo-location está mockeado en jest.setup.ts; aquí se fija qué devuelve cada función.
const mocked = jest.mocked(ExpoLocation);

beforeEach(() => {
  jest.clearAllMocks();
  mocked.requestForegroundPermissionsAsync.mockResolvedValue({ granted: true } as any);
  mocked.hasServicesEnabledAsync.mockResolvedValue(true);
  mocked.getCurrentPositionAsync.mockResolvedValue({ coords: { latitude: -12.0701, longitude: -77.0801 } } as any);
  mocked.reverseGeocodeAsync.mockResolvedValue([{ name: 'Biblioteca Central', district: 'San Miguel', city: 'Lima' } as any]);
});

const locate = async () => {
  const { result } = await renderHook(() => useCurrentLocation());
  let found = null as Location | null;
  await act(async () => {
    found = await result.current.locate();
  });
  return { result, found };
};

it('con permiso devuelve un nombre legible y las coordenadas', async () => {
  const { result, found } = await locate();
  expect(found).toEqual({ name: 'Biblioteca Central, San Miguel', latitude: -12.0701, longitude: -77.0801 });
  expect(mocked.getCurrentPositionAsync).toHaveBeenCalledWith({ accuracy: ExpoLocation.Accuracy.Balanced });
  expect(mocked.reverseGeocodeAsync).toHaveBeenCalledWith({ latitude: -12.0701, longitude: -77.0801 });
  expect(result.current.error).toBeNull();
  expect(result.current.locating).toBe(false);
});

it('permiso denegado: null, mensaje y no lee la posición', async () => {
  mocked.requestForegroundPermissionsAsync.mockResolvedValue({ granted: false } as any);
  const { result, found } = await locate();
  expect(found).toBeNull();
  expect(result.current.error).toBe(LOCATION_MESSAGES.denied);
  expect(result.current.error).toBe('Sin permiso de ubicación. Escribe el lugar a mano o actívalo en los ajustes del teléfono.');
  expect(mocked.getCurrentPositionAsync).not.toHaveBeenCalled();
});

it('ubicación del teléfono apagada', async () => {
  mocked.hasServicesEnabledAsync.mockResolvedValue(false);
  const { result, found } = await locate();
  expect(found).toBeNull();
  expect(result.current.error).toBe('La ubicación del teléfono está desactivada. Actívala o escribe el lugar a mano.');
});

it('posición no disponible', async () => {
  mocked.getCurrentPositionAsync.mockRejectedValue(new Error('timeout'));
  const { result, found } = await locate();
  expect(found).toBeNull();
  expect(result.current.error).toBe('No se pudo obtener tu ubicación. Inténtalo de nuevo o escribe el lugar a mano.');
});

it('sin dirección conocida, o si el geocodificador falla, usa las coordenadas como nombre', async () => {
  mocked.reverseGeocodeAsync.mockResolvedValueOnce([]);
  expect((await locate()).found).toEqual({ name: 'Ubicación (-12.07010, -77.08010)', latitude: -12.0701, longitude: -77.0801 });
  mocked.reverseGeocodeAsync.mockRejectedValueOnce(new Error('sin red'));
  expect((await locate()).found?.name).toBe('Ubicación (-12.07010, -77.08010)');
});

it('locating mientras busca; una segunda llamada en curso no repite el permiso', async () => {
  let grant!: (value: unknown) => void;
  mocked.requestForegroundPermissionsAsync.mockReturnValue(new Promise((resolve) => (grant = resolve)) as any);
  const { result } = await renderHook(() => useCurrentLocation());
  let first!: Promise<unknown>;
  let second: unknown;
  await act(async () => {
    first = result.current.locate();
    second = await result.current.locate();
  });
  expect(result.current.locating).toBe(true);
  expect(second).toBeNull();
  await act(async () => {
    grant({ granted: true });
    await first;
  });
  expect(mocked.requestForegroundPermissionsAsync).toHaveBeenCalledTimes(1);
  expect(result.current.locating).toBe(false);
});

it('denegado para siempre (canAskAgain false): canOpenSettings; si se puede volver a pedir, no', async () => {
  mocked.requestForegroundPermissionsAsync.mockResolvedValue({ granted: false, canAskAgain: false } as any);
  const first = await locate();
  expect(first.result.current.canOpenSettings).toBe(true);
  expect(first.result.current.error).toBe(LOCATION_MESSAGES.denied);

  mocked.requestForegroundPermissionsAsync.mockResolvedValue({ granted: false, canAskAgain: true } as any);
  const second = await locate();
  expect(second.result.current.canOpenSettings).toBe(false);
});

it('clearError y un intento con permiso apagan canOpenSettings', async () => {
  mocked.requestForegroundPermissionsAsync.mockResolvedValue({ granted: false, canAskAgain: false } as any);
  const { result } = await renderHook(() => useCurrentLocation());
  await act(async () => {
    await result.current.locate();
  });
  expect(result.current.canOpenSettings).toBe(true);
  await act(async () => result.current.clearError());
  expect(result.current.canOpenSettings).toBe(false);
  await act(async () => {
    await result.current.locate();
  });
  expect(result.current.canOpenSettings).toBe(true);
  mocked.requestForegroundPermissionsAsync.mockResolvedValue({ granted: true, canAskAgain: true } as any);
  await act(async () => {
    await result.current.locate();
  });
  expect(result.current.canOpenSettings).toBe(false);
  expect(result.current.error).toBeNull();
});
