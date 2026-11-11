import { act, renderHook } from '@testing-library/react-native';
import { Gyroscope } from 'expo-sensors';

import { useStillness } from '../useStillness';

// El giroscopio está mockeado en jest.setup.ts; `__emit` avisa a los listeners activos.
const mocked = jest.mocked(Gyroscope);
const emit = (x: number, y = 0, z = 0) => (Gyroscope as unknown as { __emit(r: object): void }).__emit({ x, y, z });

// Emite lecturas cada 100 ms durante `ms`.
async function readFor(ms: number, x = 0.1) {
  for (let t = 0; t < ms; t += 100) {
    await act(async () => {
      emit(x);
      jest.advanceTimersByTime(100);
    });
  }
}

beforeEach(() => {
  jest.useFakeTimers();
  jest.clearAllMocks();
  mocked.isAvailableAsync.mockResolvedValue(true);
});
afterEach(() => jest.useRealTimers());

it('quieto tras 400 ms bajo 0,6', async () => {
  const { result } = await renderHook(() => useStillness(true));
  expect(mocked.setUpdateInterval).toHaveBeenCalledWith(100);
  expect(result.current).toBe(false);
  await readFor(300);
  expect(result.current).toBe(false);
  await readFor(200);
  expect(result.current).toBe(true);
});

it('un pico de 1 rad/s lo vuelve false', async () => {
  const { result } = await renderHook(() => useStillness(true));
  await readFor(500);
  expect(result.current).toBe(true);
  await act(async () => emit(1));
  expect(result.current).toBe(false);
  await readFor(300);
  expect(result.current).toBe(false);
  await readFor(200);
  expect(result.current).toBe(true);
});

it('sin giroscopio devuelve true', async () => {
  mocked.isAvailableAsync.mockResolvedValue(false);
  const { result } = await renderHook(() => useStillness(true));
  expect(result.current).toBe(true);
  expect(mocked.addListener).not.toHaveBeenCalled();
});

it('no escucha con enabled=false y deja de escuchar al desmontar', async () => {
  const off = await renderHook(() => useStillness(false));
  expect(mocked.addListener).not.toHaveBeenCalled();
  expect(off.result.current).toBe(false);
  const on = await renderHook(() => useStillness(true));
  const subscription = mocked.addListener.mock.results[0].value;
  await act(async () => on.unmount());
  expect(subscription.remove).toHaveBeenCalledTimes(1);
});
