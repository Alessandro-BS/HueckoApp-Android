import { NativeModule, requireOptionalNativeModule } from 'expo';

// Sensor de proximidad (solo Android, Kotlin en android/). En Expo Go o iOS no hay módulo nativo.
export type ProximityChangeEvent = { near: boolean };
export type ProximitySubscription = { remove(): void };

type ProximityEvents = { onChange: (event: ProximityChangeEvent) => void };

declare class ProximityNativeModule extends NativeModule<ProximityEvents> {
  isAvailable(): boolean;
}

const native = requireOptionalNativeModule<ProximityNativeModule>('Proximity');

// true si el celular tiene sensor de proximidad y la app trae el módulo nativo (development build o APK).
export function isAvailable(): boolean {
  return native?.isAvailable() ?? false;
}

// El sensor se enciende con el primer listener y se apaga al quitar el último (OnStartObserving/OnStopObserving).
// Solo avisa cuando cambia `near`. Sin módulo nativo devuelve un `remove` que no hace nada.
export function addProximityListener(listener: (event: ProximityChangeEvent) => void): ProximitySubscription {
  if (!native) return { remove: () => {} };
  return native.addListener('onChange', listener);
}
