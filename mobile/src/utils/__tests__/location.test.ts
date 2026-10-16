import { Linking } from 'react-native';

import { showToast } from '../toast';
import { coordinatesLabel, formatPlaceName, mapsUrl, openInMaps } from '../location';

jest.mock('../toast', () => ({ showToast: jest.fn() }));

it('formatPlaceName: nombre del sitio (o calle y número) y el distrito o la ciudad, sin repetir', () => {
  expect(formatPlaceName({ name: 'Biblioteca Central', district: 'San Miguel', city: 'Lima' })).toBe('Biblioteca Central, San Miguel');
  expect(formatPlaceName({ name: null, street: 'Av. Universitaria', streetNumber: '1801', district: null, city: 'Lima' })).toBe(
    'Av. Universitaria 1801, Lima',
  );
  expect(formatPlaceName({ name: 'Lima', city: 'Lima' })).toBe('Lima');
  expect(formatPlaceName({ name: null, street: null, city: null })).toBeNull();
});

it('coordinatesLabel con 5 decimales', () => {
  expect(coordinatesLabel(-12.0701, -77.0801)).toBe('Ubicación (-12.07010, -77.08010)');
});

it('mapsUrl: geo: en Android y Google Maps en el resto', () => {
  const place = { name: 'Biblioteca central', latitude: -12.07, longitude: -77.08 };
  expect(mapsUrl(place, 'android')).toBe('geo:-12.07,-77.08?q=-12.07,-77.08(Biblioteca%20central)');
  expect(mapsUrl(place, 'ios')).toBe('https://maps.google.com/?q=-12.07,-77.08');
});

it('openInMaps abre la URL y avisa si no hay app de mapas', async () => {
  const place = { name: 'Biblioteca central', latitude: -12.07, longitude: -77.08 };
  const open = jest.spyOn(Linking, 'openURL').mockResolvedValueOnce(true).mockRejectedValueOnce(new Error('sin app'));
  await openInMaps(place);
  expect(open).toHaveBeenCalledWith(mapsUrl(place));
  expect(showToast).not.toHaveBeenCalled();
  await openInMaps(place);
  expect(showToast).toHaveBeenCalledWith('No se pudo abrir el mapa.');
});
