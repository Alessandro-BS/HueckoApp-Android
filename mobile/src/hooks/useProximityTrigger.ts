import { useEffect, useRef } from 'react';

import { useProximity } from './useProximity';
import { useStillness } from './useStillness';

// El sensor emite su primera lectura nada más empezar a escuchar; si ya está cerca (mano, bolsillo) no es una transición.
const INITIAL_READING_MS = 300;

// Llama a `onTrigger` una vez en cada transición lejos→cerca con el celular quieto (juntar dos celulares).
export function useProximityTrigger(
  enabled: boolean,
  onTrigger: () => void,
): { available: boolean; near: boolean; still: boolean } {
  const { available, near } = useProximity(enabled);
  const still = useStillness(enabled);

  // Se leen dentro del efecto, que solo depende de `near`.
  const stillRef = useRef(still);
  stillRef.current = still;
  const onTriggerRef = useRef(onTrigger);
  onTriggerRef.current = onTrigger;

  const enabledAt = useRef<number | null>(null);
  useEffect(() => {
    enabledAt.current = enabled ? Date.now() : null;
  }, [enabled]);

  useEffect(() => {
    if (!near || enabledAt.current === null) return;
    if (Date.now() - enabledAt.current < INITIAL_READING_MS) return;
    if (stillRef.current) onTriggerRef.current();
  }, [near]);

  return { available, near, still };
}
