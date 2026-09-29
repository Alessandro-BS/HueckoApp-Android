import { useCallback, useEffect, useRef, useState } from 'react';

import { errorMessage } from '../api/client';

export type ActionResult<R> = { ok: true; value: R } | { ok: false };

// Hook genérico para ESCRIBIR (crear, unirse, guardar…): expone loading y el mensaje de error,
// y evita el doble envío. Nunca lanza: devuelve { ok: false } si falló o si ya había uno en curso.
export function useAction<A extends unknown[], R>(fn: (...args: A) => Promise<R>) {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const fnRef = useRef(fn);
  const busy = useRef(false);
  const mounted = useRef(true);

  useEffect(() => {
    fnRef.current = fn;
  }, [fn]);

  useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
    };
  }, []);

  const run = useCallback(async (...args: A): Promise<ActionResult<R>> => {
    if (busy.current) return { ok: false };
    busy.current = true;
    setLoading(true);
    setError(null);
    try {
      return { ok: true, value: await fnRef.current(...args) };
    } catch (e) {
      if (mounted.current) setError(errorMessage(e));
      return { ok: false };
    } finally {
      busy.current = false;
      if (mounted.current) setLoading(false);
    }
  }, []);

  const clearError = useCallback(() => setError(null), []);

  return { run, loading, error, clearError };
}
