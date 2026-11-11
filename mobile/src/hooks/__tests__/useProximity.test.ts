import { useIsFocused } from '@react-navigation/native';
import { act, renderHook } from '@testing-library/react-native';

import * as Proximity from '../../../modules/proximity';
import { useProximity } from '../useProximity';

// El módulo de proximidad está mockeado en jest.setup.ts; `__emit` avisa a los listeners activos.
jest.mock('@react-navigation/native', () => ({ useIsFocused: jest.fn(() => true) }));

const mocked = jest.mocked(Proximity);
const emit = (near: boolean) => (Proximity as unknown as { __emit(near: boolean): void }).__emit(near);

beforeEach(() => {
  jest.clearAllMocks();
  mocked.isAvailable.mockReturnValue(true);
  jest.mocked(useIsFocused).mockReturnValue(true);
});

it('useProximity refleja near al emitir', async () => {
  const { result } = await renderHook(() => useProximity(true));
  expect(result.current).toEqual({ available: true, near: false, readings: 0 });
  await act(async () => emit(true));
  expect(result.current).toEqual({ available: true, near: true, readings: 1 });
  await act(async () => emit(false));
  expect(result.current.near).toBe(false);
});

it('no escucha con enabled=false', async () => {
  const { result } = await renderHook(() => useProximity(false));
  expect(mocked.addProximityListener).not.toHaveBeenCalled();
  await act(async () => emit(true));
  expect(result.current.near).toBe(false);
});

it('deja de escuchar al desmontar', async () => {
  const { unmount } = await renderHook(() => useProximity(true));
  const subscription = mocked.addProximityListener.mock.results[0].value;
  expect(subscription.remove).not.toHaveBeenCalled();
  await act(async () => unmount());
  expect(subscription.remove).toHaveBeenCalledTimes(1);
});

it('deja de escuchar al perder el foco y vuelve a lejos', async () => {
  const { result, rerender } = await renderHook(() => useProximity(true));
  await act(async () => emit(true));
  const subscription = mocked.addProximityListener.mock.results[0].value;
  jest.mocked(useIsFocused).mockReturnValue(false);
  await rerender({});
  expect(subscription.remove).toHaveBeenCalledTimes(1);
  expect(result.current.near).toBe(false);
});

it('available=false sin módulo nativo', async () => {
  // El módulo real, sin implementación nativa (como en Expo Go o iOS).
  const real = jest.requireActual<typeof Proximity>('../../../modules/proximity');
  expect(real.isAvailable()).toBe(false);
  expect(() => real.addProximityListener(() => {}).remove()).not.toThrow();

  mocked.isAvailable.mockReturnValue(false);
  const { result } = await renderHook(() => useProximity(true));
  expect(result.current).toEqual({ available: false, near: false, readings: 0 });
  expect(mocked.addProximityListener).not.toHaveBeenCalled();
});
