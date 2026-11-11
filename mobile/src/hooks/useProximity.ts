import { useIsFocused } from '@react-navigation/native';
import { useEffect, useState } from 'react';

import { addProximityListener, isAvailable } from '../../modules/proximity';

// Sensor de proximidad: `near` es true con algo pegado a la pantalla (otro celular, la mano).
// Escucha solo con `enabled` y con la pantalla en foco; al dejar de escuchar vuelve a `near = false`.
// `available` es false en Expo Go, iOS o celulares sin sensor.
export function useProximity(enabled: boolean): { available: boolean; near: boolean } {
  const [available] = useState(isAvailable);
  const [near, setNear] = useState(false);
  const focused = useIsFocused();
  const listening = enabled && focused && available;

  useEffect(() => {
    if (!listening) return;
    const subscription = addProximityListener((event) => setNear(event.near));
    return () => {
      subscription.remove();
      setNear(false);
    };
  }, [listening]);

  return { available, near };
}
