import { useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react';

import { errorMessage } from '../api/client';

export type Resource<T> = {
  data: T | undefined;
  /** true si ya hay datos del recurso actual (aunque sea una lista vacía). */
  loaded: boolean;
  /** Mensaje listo para mostrar si la última carga falló; null si fue bien. */
  error: string | null;
  /** Primera carga, todavía sin datos. */
  loading: boolean;
  /** Recarga con datos ya en pantalla (deslizar para actualizar, volver a la pantalla). */
  refreshing: boolean;
  reload: () => Promise<void>;
  /**
   * Cambia los datos en memoria sin ir al servidor (tras crear o borrar algo). Descarta cualquier
   * carga en curso (traería el estado de antes del cambio). Si `load` cambió desde que se obtuvo
   * este `mutate`, no hace nada: el cambio era del recurso anterior.
   */
  mutate: (update: (prev: T | undefined) => T | undefined) => void;
};

// Hook genérico para LEER del servidor. Carga al montar y cada vez que cambia `load`,
// distingue la primera carga de una recarga y descarta respuestas que llegan tarde.
// `load` debe ser estable (función de módulo o useCallback); si no, recargaría en cada render.
// Si `load` cambia (p. ej. otro id), los datos anteriores se descartan: son de otro recurso.
//
// Cada petición lleva un número (`lastRequest`); solo se aplica la respuesta de la última.
// El número sube al empezar una carga, al hacer `mutate`, al desmontar y al confirmarse un `load`
// nuevo (en useLayoutEffect, síncrono con el commit: no queda ningún hueco en el que una respuesta
// del `load` anterior pueda colarse antes de que arranque la carga del nuevo).
export function useResource<T>(load: () => Promise<T>): Resource<T> {
  const [data, setData] = useState<T | undefined>(undefined);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [currentLoad, setCurrentLoad] = useState(() => load);
  const loadRef = useRef(load);
  const hasData = useRef(false);
  const lastRequest = useRef(0);

  // Ajuste durante el render: así nunca se pinta ni un fotograma con los datos del recurso anterior.
  if (currentLoad !== load) {
    setCurrentLoad(() => load);
    setData(undefined);
    setError(null);
    setLoading(true);
    setRefreshing(false);
  }

  useLayoutEffect(() => {
    hasData.current = data !== undefined;
  }, [data]);

  // Se confirma un `load` nuevo: todo lo pendiente era del anterior y se ignora.
  useLayoutEffect(() => {
    if (loadRef.current === load) return;
    loadRef.current = load;
    lastRequest.current += 1;
  }, [load]);

  const reload = useCallback(async () => {
    const request = ++lastRequest.current;
    if (hasData.current) setRefreshing(true);
    else setLoading(true);
    try {
      const result = await loadRef.current();
      if (request !== lastRequest.current) return; // llegó tarde: ya hay una petición más nueva
      setData(result);
      setError(null);
    } catch (e) {
      if (request !== lastRequest.current) return;
      setError(errorMessage(e));
    } finally {
      if (request === lastRequest.current) {
        setLoading(false);
        setRefreshing(false);
      }
    }
  }, []);

  useEffect(() => {
    void reload();
  }, [load, reload]);

  // Al desmontar, cualquier respuesta pendiente se ignora.
  useEffect(
    () => () => {
      lastRequest.current += 1;
    },
    [],
  );

  const mutate = useCallback(
    (update: (prev: T | undefined) => T | undefined) => {
      if (loadRef.current !== load) return;
      lastRequest.current += 1;
      setLoading(false);
      setRefreshing(false);
      setData((prev) => update(prev));
    },
    [load],
  );

  return { data, loaded: data !== undefined, error, loading, refreshing, reload, mutate };
}
