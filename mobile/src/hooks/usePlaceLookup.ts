import type { Location } from '@hueckoapp/shared';
import * as ExpoLocation from 'expo-location';
import { useCallback, useState } from 'react';

import { coordinatesLabel, formatPlaceName } from '../utils/location';

export const PLACE_MESSAGES = {
  denied: 'Sin permiso de ubicación no se pueden buscar direcciones. Toca el mapa para marcar el lugar.',
  notFound: 'No encontramos esa dirección. Prueba con más detalle (calle, distrito) o toca el mapa.',
  failed: 'No se pudo buscar ahora. Inténtalo de nuevo o toca el mapa.',
} as const;

type Place = Location & { latitude: number; longitude: number };

// En Android, buscar y nombrar direcciones (Geocoder) exige el permiso de ubicación en primer plano.
const hasPermission = async () => (await ExpoLocation.requestForegroundPermissionsAsync()).granted;

// Buscador del selector de lugar en el mapa: texto → coordenadas (geocodificación) y coordenadas → nombre
// (geocodificación inversa). Usa el geocodificador del sistema: sin claves ni servicios de pago. Nunca lanza.
export function usePlaceLookup() {
  const [searching, setSearching] = useState(false);
  const [error, setError] = useState<string | null>(null);

  /** El primer resultado, nombrado con lo que escribió el usuario («Biblioteca Central PUCP»). null si no hay. */
  const search = useCallback(async (query: string): Promise<Place | null> => {
    const text = query.trim();
    if (!text) return null;
    setSearching(true);
    setError(null);
    try {
      if (!(await hasPermission())) {
        setError(PLACE_MESSAGES.denied);
        return null;
      }
      const [first] = await ExpoLocation.geocodeAsync(text);
      if (!first) {
        setError(PLACE_MESSAGES.notFound);
        return null;
      }
      return { name: text, latitude: first.latitude, longitude: first.longitude };
    } catch {
      setError(PLACE_MESSAGES.failed);
      return null;
    } finally {
      setSearching(false);
    }
  }, []);

  /** Nombre legible de un punto del mapa; si no se puede, sus coordenadas. */
  const nameAt = useCallback(async (latitude: number, longitude: number): Promise<string> => {
    try {
      if (await hasPermission()) {
        const [address] = await ExpoLocation.reverseGeocodeAsync({ latitude, longitude });
        const name = address ? formatPlaceName(address) : null;
        if (name) return name;
      }
    } catch {
      // Sin red o sin geocodificador: se usan las coordenadas.
    }
    return coordinatesLabel(latitude, longitude);
  }, []);

  const clearError = useCallback(() => setError(null), []);

  return { search, nameAt, searching, error, clearError };
}
