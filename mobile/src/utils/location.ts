import { Linking, Platform } from 'react-native';

import { showToast } from './toast';

// Campos de LocationGeocodedAddress (expo-location) que sirven para nombrar un sitio.
export type PlaceAddress = {
  name?: string | null;
  street?: string | null;
  streetNumber?: string | null;
  district?: string | null;
  city?: string | null;
  region?: string | null;
};

/** «Biblioteca Central, San Miguel» o «Av. Universitaria 1801, Lima». null si la dirección no trae nada útil. */
export function formatPlaceName(address: PlaceAddress): string | null {
  const street = address.street ? [address.street, address.streetNumber].filter(Boolean).join(' ') : null;
  const first = address.name || street;
  const second = address.district || address.city || address.region;
  const parts = [first, second].filter((part): part is string => !!part && part.trim().length > 0);
  const unique = parts.filter((part, index) => parts.indexOf(part) === index);
  return unique.length > 0 ? unique.join(', ') : null;
}

export const coordinatesLabel = (latitude: number, longitude: number) =>
  `Ubicación (${latitude.toFixed(5)}, ${longitude.toFixed(5)})`;

type MappablePlace = { name: string; latitude: number; longitude: number };

/** En Android, un intent `geo:` (abre la app de mapas que haya); en el resto, Google Maps en la web. */
export function mapsUrl(place: MappablePlace, os: string = Platform.OS): string {
  const coords = `${place.latitude},${place.longitude}`;
  if (os === 'android') return `geo:${coords}?q=${coords}(${encodeURIComponent(place.name)})`;
  return `https://maps.google.com/?q=${coords}`;
}

export async function openInMaps(place: MappablePlace): Promise<void> {
  try {
    await Linking.openURL(mapsUrl(place));
  } catch {
    showToast('No se pudo abrir el mapa.');
  }
}
