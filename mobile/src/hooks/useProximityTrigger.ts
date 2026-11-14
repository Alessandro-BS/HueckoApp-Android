import { useIsFocused } from '@react-navigation/native';
import { useEffect, useRef } from 'react';

import { useProximity } from './useProximity';
import { useStillness } from './useStillness';

/**
 * Tras una transición lejos→cerca, cuánto se espera a que el celular se quede quieto. Corto a propósito: los dos avisos
 * tienen que llegar al servidor a menos de 3 s uno del otro (MATCH_WINDOW_MS del backend).
 */
export const ARM_WINDOW_MS = 1500;

// Llama a `onTrigger` una vez por cada transición lejos→cerca (juntar dos celulares) si el celular está quieto en ese
// momento o se queda quieto, sin alejarse, en los ARM_WINDOW_MS siguientes.
// La primera lectura tras cada suscripción del sensor (al habilitar, al volver a enfocar la pantalla o al volver la app
// a primer plano) es el estado inicial: si ya está cerca (mano, bolsillo) no cuenta como transición.
export function useProximityTrigger(
  enabled: boolean,
  onTrigger: () => void,
): { available: boolean; near: boolean; still: boolean } {
  const focused = useIsFocused();
  const { available, near, readings } = useProximity(enabled);
  const still = useStillness(enabled && focused);

  const stillRef = useRef(still);
  stillRef.current = still;
  const onTriggerRef = useRef(onTrigger);
  onTriggerRef.current = onTrigger;

  // Hasta cuándo (Date.now()) vale quedarse quieto para la última transición lejos→cerca; null = desarmado.
  const armedUntil = useRef<number | null>(null);
  const previousNear = useRef<boolean | null>(null);

  useEffect(() => {
    if (readings === 0) {
      previousNear.current = null;
      armedUntil.current = null;
      return;
    }
    const wasFar = previousNear.current === false;
    previousNear.current = near;
    if (!near) {
      armedUntil.current = null;
      return;
    }
    if (!wasFar) return;
    if (stillRef.current) {
      armedUntil.current = null;
      onTriggerRef.current();
    } else {
      armedUntil.current = Date.now() + ARM_WINDOW_MS;
    }
  }, [near, readings]);

  // Se quedó quieto después de juntarlos: dispara si sigue armado (sigue cerca y dentro de la ventana).
  useEffect(() => {
    const until = armedUntil.current;
    if (!still || until === null) return;
    armedUntil.current = null;
    if (Date.now() <= until) onTriggerRef.current();
  }, [still]);

  return { available, near, still };
}
