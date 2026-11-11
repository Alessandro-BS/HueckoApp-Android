import { useIsFocused } from '@react-navigation/native';
import { useEffect, useRef } from 'react';

import { useProximity } from './useProximity';
import { useStillness } from './useStillness';

// Llama a `onTrigger` una vez en cada transición lejos→cerca con el celular quieto (juntar dos celulares).
// La primera lectura tras cada suscripción del sensor (al habilitar o al volver a enfocar la pantalla) es el estado
// inicial: si ya está cerca (mano, bolsillo) no cuenta como transición.
export function useProximityTrigger(
  enabled: boolean,
  onTrigger: () => void,
): { available: boolean; near: boolean; still: boolean } {
  const focused = useIsFocused();
  const { available, near, readings } = useProximity(enabled);
  const still = useStillness(enabled && focused);

  // Se leen dentro del efecto, que solo depende de las lecturas del sensor.
  const stillRef = useRef(still);
  stillRef.current = still;
  const onTriggerRef = useRef(onTrigger);
  onTriggerRef.current = onTrigger;

  const previousNear = useRef<boolean | null>(null);
  useEffect(() => {
    if (readings === 0) {
      previousNear.current = null;
      return;
    }
    const wasFar = previousNear.current === false;
    previousNear.current = near;
    if (wasFar && near && stillRef.current) onTriggerRef.current();
  }, [near, readings]);

  return { available, near, still };
}
