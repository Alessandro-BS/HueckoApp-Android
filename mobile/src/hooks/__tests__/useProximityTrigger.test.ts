import { useIsFocused } from '@react-navigation/native';
import { act, renderHook } from '@testing-library/react-native';
import { Gyroscope } from 'expo-sensors';

import * as Proximity from '../../../modules/proximity';
import { useProximityTrigger } from '../useProximityTrigger';

jest.mock('@react-navigation/native', () => ({ useIsFocused: jest.fn(() => true) }));

const emitNear = (near: boolean) => (Proximity as unknown as { __emit(n: boolean): void }).__emit(near);
const emitGyro = (x: number) => (Gyroscope as unknown as { __emit(r: object): void }).__emit({ x, y: 0, z: 0 });

// Lecturas cada 100 ms durante `ms`.
async function readFor(ms: number, x = 0.1) {
  for (let t = 0; t < ms; t += 100) {
    await act(async () => {
      emitGyro(x);
      jest.advanceTimersByTime(100);
    });
  }
}

beforeEach(() => {
  jest.useFakeTimers();
  jest.clearAllMocks();
  jest.mocked(Proximity.isAvailable).mockReturnValue(true);
  jest.mocked(Gyroscope.isAvailableAsync).mockResolvedValue(true);
  jest.mocked(useIsFocused).mockReturnValue(true);
});
afterEach(() => jest.useRealTimers());

it('lejos→cerca quieto dispara una vez', async () => {
  const onTrigger = jest.fn();
  await renderHook(() => useProximityTrigger(true, onTrigger));
  await readFor(600);
  await act(async () => emitNear(false)); // lectura inicial
  await act(async () => emitNear(true));
  expect(onTrigger).toHaveBeenCalledTimes(1);
  await readFor(200);
  expect(onTrigger).toHaveBeenCalledTimes(1);
});

it('cerca→lejos→cerca en 300 ms dispara una sola vez por transición', async () => {
  const onTrigger = jest.fn();
  await renderHook(() => useProximityTrigger(true, onTrigger));
  await readFor(600);
  await act(async () => emitNear(false)); // lectura inicial
  await act(async () => emitNear(true));
  await readFor(100);
  await act(async () => emitNear(false));
  await readFor(100);
  await act(async () => emitNear(true));
  expect(onTrigger).toHaveBeenCalledTimes(2);
});

it('si ya estaba cerca al habilitarse no dispara hasta lejos→cerca', async () => {
  const onTrigger = jest.fn();
  await renderHook(() => useProximityTrigger(true, onTrigger));
  await readFor(600);
  await act(async () => emitNear(true)); // primera lectura, aunque llegue tarde: estado inicial
  await readFor(200);
  expect(onTrigger).not.toHaveBeenCalled();
  await act(async () => emitNear(false));
  await act(async () => emitNear(true));
  expect(onTrigger).toHaveBeenCalledTimes(1);
});

it('primera lectura lejos y luego cerca enseguida dispara', async () => {
  const onTrigger = jest.fn();
  jest.mocked(Gyroscope.isAvailableAsync).mockResolvedValue(false); // siempre quieto
  await renderHook(() => useProximityTrigger(true, onTrigger));
  await act(async () => emitNear(false));
  await act(async () => emitNear(true));
  expect(onTrigger).toHaveBeenCalledTimes(1);
});

it('al volver a enfocar con el sensor tapado no dispara', async () => {
  const onTrigger = jest.fn();
  const { rerender } = await renderHook(() => useProximityTrigger(true, onTrigger));
  await readFor(600);
  jest.mocked(useIsFocused).mockReturnValue(false);
  await rerender({});
  jest.mocked(useIsFocused).mockReturnValue(true);
  await rerender({});
  await readFor(600);
  await act(async () => emitNear(true)); // lectura inicial de la nueva suscripción
  expect(onTrigger).not.toHaveBeenCalled();
});

it('sin foco no escucha el giroscopio', async () => {
  jest.mocked(useIsFocused).mockReturnValue(false);
  await renderHook(() => useProximityTrigger(true, jest.fn()));
  expect(Gyroscope.addListener).not.toHaveBeenCalled();
});

it('en movimiento no dispara', async () => {
  const onTrigger = jest.fn();
  await renderHook(() => useProximityTrigger(true, onTrigger));
  await readFor(600, 1);
  await act(async () => emitNear(false));
  await act(async () => emitNear(true));
  expect(onTrigger).not.toHaveBeenCalled();
});

it('con enabled=false no dispara', async () => {
  const onTrigger = jest.fn();
  await renderHook(() => useProximityTrigger(false, onTrigger));
  await readFor(600);
  await act(async () => emitNear(true));
  expect(onTrigger).not.toHaveBeenCalled();
});
