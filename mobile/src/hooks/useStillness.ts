import { Gyroscope } from 'expo-sensors';
import { useEffect, useState } from 'react';

import { useAppActive } from './useAppActive';

export const STILL_THRESHOLD = 0.6; // rad/s
export const STILL_WINDOW_MS = 400;
const UPDATE_INTERVAL_MS = 100;

// Dice si el celular está quieto: todas las lecturas del giroscopio de los últimos 400 ms bajo 0,6 rad/s.
// Sin lecturas todavía cuenta como "no quieto". Si no hay giroscopio, siempre true (no bloquea el disparo).
// Con `enabled = false` o con la app en segundo plano (expo-sensors deja de mandar lecturas) no escucha y devuelve
// false (salvo que se sepa que no hay giroscopio): sin lecturas no se queda en el último valor.
export function useStillness(enabled: boolean): boolean {
  const [gyroAvailable, setGyroAvailable] = useState<boolean | null>(null);
  const [still, setStill] = useState(false);
  const appActive = useAppActive();
  const listening = enabled && appActive;

  useEffect(() => {
    let cancelled = false;
    Gyroscope.isAvailableAsync()
      .then((available) => !cancelled && setGyroAvailable(available))
      .catch(() => !cancelled && setGyroAvailable(false));
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    if (!listening || !gyroAvailable) return;
    let quietSince: number | null = null;
    Gyroscope.setUpdateInterval(UPDATE_INTERVAL_MS);
    const subscription = Gyroscope.addListener(({ x, y, z }) => {
      const now = Date.now();
      if (Math.sqrt(x * x + y * y + z * z) >= STILL_THRESHOLD) quietSince = null;
      else if (quietSince === null) quietSince = now;
      setStill(quietSince !== null && now - quietSince >= STILL_WINDOW_MS);
    });
    return () => {
      subscription.remove();
      setStill(false);
    };
  }, [listening, gyroAvailable]);

  return gyroAvailable === false ? true : still;
}
