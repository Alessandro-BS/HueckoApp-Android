import { useIsFocused } from '@react-navigation/native';
import { useEffect, useState } from 'react';

import { addProximityListener, isAvailable } from '../../modules/proximity';

// Sensor de proximidad: `near` es true con algo pegado a la pantalla (otro celular, la mano).
// Escucha solo con `enabled` y con la pantalla en foco; al dejar de escuchar vuelve a `near = false`.
// `available` es false en Expo Go, iOS o celulares sin sensor.
// `readings` cuenta las lecturas desde la última suscripción: la primera es el estado inicial, no un cambio.
export function useProximity(enabled: boolean): { available: boolean; near: boolean; readings: number } {
  const [available] = useState(isAvailable);
  const [state, setState] = useState({ near: false, readings: 0 });
  const focused = useIsFocused();
  const listening = enabled && focused && available;

  useEffect(() => {
    if (!listening) return;
    const subscription = addProximityListener((event) => setState((previous) => ({ near: event.near, readings: previous.readings + 1 })));
    return () => {
      subscription.remove();
      setState({ near: false, readings: 0 });
    };
  }, [listening]);

  return { available, near: state.near, readings: state.readings };
}
