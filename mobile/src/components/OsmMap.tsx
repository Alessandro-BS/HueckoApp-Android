import { forwardRef, useEffect, useImperativeHandle, useRef, useState } from 'react';
import { StyleSheet, Text, View, type StyleProp, type ViewStyle } from 'react-native';
import { WebView, type WebViewMessageEvent } from 'react-native-webview';

import { colors, typography } from '../theme';

export type LatLng = { latitude: number; longitude: number };
export type OsmMapHandle = { animateTo: (point: LatLng, zoom?: number) => void };

type Props = {
  initialCenter: LatLng;
  initialZoom: number;
  /** Pin arrastrable; null = sin pin. */
  marker: LatLng | null;
  onPress: (point: LatLng) => void;
  onMarkerDragEnd: (point: LatLng) => void;
  style?: StyleProp<ViewStyle>;
};

// Origen de la página: con él la WebView manda un Referer, que los servidores de teselas de OpenStreetMap exigen.
const BASE_URL = 'https://hueckoapp.app/';
export const PIN_ZOOM = 16;

const point = (p: LatLng | null) => (p ? `${Number(p.latitude)},${Number(p.longitude)}` : 'null');

// Leaflet + teselas de OpenStreetMap: no necesita clave (el mapa de Google de react-native-maps sale negro en Expo Go,
// porque Google rechaza la clave que trae Expo Go). La página avisa a la app con postMessage: «press» al tocar el mapa,
// «dragEnd» al soltar el pin y «error» si Leaflet no cargó (sin internet).
const mapHtml = (center: LatLng, zoom: number, marker: LatLng | null) => `<!doctype html>
<html><head>
<meta name="viewport" content="width=device-width, initial-scale=1, maximum-scale=1, user-scalable=no">
<link rel="stylesheet" href="https://unpkg.com/leaflet@1.9.4/dist/leaflet.css" integrity="sha256-p4NxAoJBhIIN+hmNHrzRCf9tD/miZyoHS5obTRR9BMY=" crossorigin="">
<script src="https://unpkg.com/leaflet@1.9.4/dist/leaflet.js" integrity="sha256-20nQCchB9co0qIjJZRGuk2/Z9VM+kNiyxNV1lvTlZBo=" crossorigin=""></script>
<style>html, body, #map { height: 100%; margin: 0; background: #e5e3df; }</style>
</head><body><div id="map"></div><script>
function post(type, latlng) {
  window.ReactNativeWebView.postMessage(JSON.stringify(latlng ? { type: type, latitude: latlng.lat, longitude: latlng.lng } : { type: type }));
}
if (!window.L) {
  post('error');
} else {
  var map = L.map('map', { zoomControl: false }).setView([${point(center)}], ${Number(zoom)});
  L.tileLayer('https://tile.openstreetmap.org/{z}/{x}/{y}.png', { maxZoom: 19, attribution: '&copy; OpenStreetMap' }).addTo(map);
  var marker = null;
  window.setMarker = function (lat, lng) {
    if (lat === null) {
      if (marker) map.removeLayer(marker);
      marker = null;
      return;
    }
    if (marker) return marker.setLatLng([lat, lng]);
    marker = L.marker([lat, lng], { draggable: true }).addTo(map);
    marker.on('dragend', function () { post('dragEnd', marker.getLatLng()); });
  };
  window.flyTo = function (lat, lng, zoom) { map.flyTo([lat, lng], zoom, { duration: 0.6 }); };
  map.on('click', function (e) { post('press', e.latlng); });
  setMarker(${point(marker)});
}
</script></body></html>`;

// Mapa de OpenStreetMap dentro de una WebView, con la misma idea que MapView: centro inicial, un pin arrastrable,
// toques y `animateTo` por ref.
export const OsmMap = forwardRef<OsmMapHandle, Props>(function OsmMap(
  { initialCenter, initialZoom, marker, onPress, onMarkerDragEnd, style },
  ref,
) {
  const web = useRef<WebView>(null);
  // La página se arma una sola vez; después el pin y el centro se cambian con JavaScript, sin recargarla.
  const [html] = useState(() => mapHtml(initialCenter, initialZoom, marker));
  const [failed, setFailed] = useState(false);

  // Antes de que cargue la página las funciones no existen: el pin se vuelve a fijar al terminar de cargar.
  const run = (js: string) => web.current?.injectJavaScript(`try { ${js} } catch (e) {} true;`);
  const syncMarker = () => run(`window.setMarker && setMarker(${point(marker)})`);

  useImperativeHandle(ref, () => ({
    animateTo: (p, zoom = PIN_ZOOM) => run(`window.flyTo && flyTo(${point(p)}, ${Number(zoom)})`),
  }));

  // Solo cuando cambia el punto (no en cada render: `marker` puede ser un objeto nuevo con las mismas coordenadas).
  useEffect(syncMarker, [marker?.latitude, marker?.longitude]);

  const onMessage = (event: WebViewMessageEvent) => {
    let message: { type?: string; latitude?: unknown; longitude?: unknown };
    try {
      message = JSON.parse(event.nativeEvent.data);
    } catch {
      return;
    }
    if (message.type === 'error') return setFailed(true);
    if (typeof message.latitude !== 'number' || typeof message.longitude !== 'number') return;
    const p = { latitude: message.latitude, longitude: message.longitude };
    if (message.type === 'press') onPress(p);
    else if (message.type === 'dragEnd') onMarkerDragEnd(p);
  };

  return (
    <View style={style}>
      <WebView
        ref={web}
        style={styles.flex}
        originWhitelist={['*']}
        source={{ html, baseUrl: BASE_URL }}
        onMessage={onMessage}
        onLoadEnd={syncMarker}
        onError={() => setFailed(true)}
        // Solo la propia página: un toque en el enlace de créditos no navega fuera del mapa.
        onShouldStartLoadWithRequest={(request) => request.url.startsWith(BASE_URL) || request.url === 'about:blank'}
        setSupportMultipleWindows={false}
      />
      {failed ? (
        <View style={styles.failed}>
          <Text style={[typography.bodyMedium, styles.failedText]}>
            No se pudo cargar el mapa. Revisa tu conexión; igual puedes buscar la dirección arriba.
          </Text>
        </View>
      ) : null}
    </View>
  );
});

const styles = StyleSheet.create({
  flex: { flex: 1 },
  failed: { ...StyleSheet.absoluteFill, alignItems: 'center', justifyContent: 'center', padding: 24, backgroundColor: colors.surfaceContainerLowest },
  failedText: { color: colors.onSurfaceVariant, textAlign: 'center' },
});
