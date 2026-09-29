import type { Location } from '@hueckoapp/shared';
import * as ExpoLocation from 'expo-location';
import { useCallback, useEffect, useRef, useState } from 'react';

import { coordinatesLabel, formatPlaceName } from '../utils/location';

export const LOCATION_MESSAGES = {
  denied: 'Sin permiso de ubicación. Escribe el lugar a mano o actívalo en los ajustes del teléfono.',
  servicesOff: 'La ubicación del teléfono está desactivada. Actívala o escribe el lugar a mano.',
  unavailable: 'No se pudo obtener tu ubicación. Inténtalo de nuevo o escribe el lugar a mano.',
} as const;

// «Usar mi ubicación actual» (tema del curso: localización en Android). Pide el permiso de ubicación en primer
// plano, lee la posición y la traduce a un nombre legible con la geocodificación inversa del sistema.
// Nunca lanza: si algo falla devuelve null y deja el motivo en `error`.
export function useCurrentLocation() {
  const [locating, setLocating] = useState(false);
  const [error, setError] = useState<string | null>(null);
  // Denegado para siempre (el sistema ya no vuelve a preguntar): solo se arregla desde los ajustes del teléfono.
  const [canOpenSettings, setCanOpenSettings] = useState(false);
  const busy = useRef(false);
  const mounted = useRef(true);

  useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
    };
  }, []);

  const locate = useCallback(async (): Promise<Location | null> => {
    if (busy.current) return null;
    busy.current = true;
    setLocating(true);
    setError(null);
    setCanOpenSettings(false);
    const fail = (message: string) => {
      if (mounted.current) setError(message);
      return null;
    };
    try {
      const { granted, canAskAgain } = await ExpoLocation.requestForegroundPermissionsAsync();
      if (!granted) {
        if (mounted.current) setCanOpenSettings(canAskAgain === false);
        return fail(LOCATION_MESSAGES.denied);
      }
      if (!(await ExpoLocation.hasServicesEnabledAsync())) return fail(LOCATION_MESSAGES.servicesOff);

      const position = await ExpoLocation.getCurrentPositionAsync({ accuracy: ExpoLocation.Accuracy.Balanced }).catch(() => null);
      if (!position) return fail(LOCATION_MESSAGES.unavailable);
      const { latitude, longitude } = position.coords;

      // Si el geocodificador falla o no conoce el sitio, el nombre son las coordenadas.
      let name: string | null = null;
      try {
        const [address] = await ExpoLocation.reverseGeocodeAsync({ latitude, longitude });
        name = address ? formatPlaceName(address) : null;
      } catch {
        name = null;
      }
      return { name: name ?? coordinatesLabel(latitude, longitude), latitude, longitude };
    } catch {
      return fail(LOCATION_MESSAGES.unavailable);
    } finally {
      busy.current = false;
      if (mounted.current) setLocating(false);
    }
  }, []);

  const clearError = useCallback(() => {
    setError(null);
    setCanOpenSettings(false);
  }, []);

  return { locate, locating, error, canOpenSettings, clearError };
}
