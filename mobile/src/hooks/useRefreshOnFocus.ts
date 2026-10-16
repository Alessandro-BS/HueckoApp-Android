import { useFocusEffect } from '@react-navigation/native';
import { useCallback, useRef } from 'react';

// Recarga cuando el usuario vuelve a la pantalla (p. ej. tras guardar un bloque o salir de un grupo).
// El primer foco se salta: los datos se acaban de cargar al montar.
export function useRefreshOnFocus(refresh: () => unknown) {
  const firstFocus = useRef(true);
  useFocusEffect(
    useCallback(() => {
      if (firstFocus.current) {
        firstFocus.current = false;
        return;
      }
      void refresh();
    }, [refresh]),
  );
}
