import { act, fireEvent, render, screen } from '@testing-library/react-native';
import { createRef, type ComponentProps } from 'react';
import * as WebViewModule from 'react-native-webview';

import { OsmMap, type OsmMapHandle } from '../OsmMap';

const injectJavaScript = (WebViewModule as unknown as { __injectJavaScript: jest.Mock }).__injectJavaScript;
const LIMA = { latitude: -12.0464, longitude: -77.0428 };
const message = (data: unknown) => ({ nativeEvent: { data: typeof data === 'string' ? data : JSON.stringify(data) } });
const injected = () => injectJavaScript.mock.calls.map(([js]) => js as string).join('\n');

type MapProps = Omit<ComponentProps<typeof OsmMap>, 'ref'>;

const renderMap = async (props: Partial<MapProps> = {}) => {
  const onPress = jest.fn();
  const onMarkerDragEnd = jest.fn();
  const ref = createRef<OsmMapHandle>();
  const view = await render(
    <OsmMap ref={ref} initialCenter={LIMA} initialZoom={12} marker={null} onPress={onPress} onMarkerDragEnd={onMarkerDragEnd} {...props} />,
  );
  return { onPress, onMarkerDragEnd, ref, view };
};

beforeEach(() => jest.clearAllMocks());

it('arma la página de Leaflet con OpenStreetMap, el centro, el zoom y el pin inicial', async () => {
  await renderMap({ initialZoom: 16, marker: { latitude: -12.07, longitude: -77.08 } });
  const { html, baseUrl } = screen.getByTestId('webview').props.source;
  expect(html).toContain('leaflet@1.9.4');
  expect(html).toContain('tile.openstreetmap.org');
  expect(html).toContain('setView([-12.0464,-77.0428], 16)');
  expect(html).toContain('setMarker(-12.07,-77.08)');
  // Con un origen https la WebView manda Referer, que exigen las teselas de OpenStreetMap.
  expect(baseUrl).toMatch(/^https:\/\//);
});

it('tocar el mapa y soltar el pin avisan con las coordenadas', async () => {
  const { onPress, onMarkerDragEnd } = await renderMap();
  await fireEvent(screen.getByTestId('webview'), 'message', message({ type: 'press', latitude: -12.07, longitude: -77.08 }));
  expect(onPress).toHaveBeenCalledWith({ latitude: -12.07, longitude: -77.08 });
  await fireEvent(screen.getByTestId('webview'), 'message', message({ type: 'dragEnd', latitude: -12.1, longitude: -77.1 }));
  expect(onMarkerDragEnd).toHaveBeenCalledWith({ latitude: -12.1, longitude: -77.1 });
});

it('ignora mensajes que no son del mapa', async () => {
  const { onPress, onMarkerDragEnd } = await renderMap();
  await fireEvent(screen.getByTestId('webview'), 'message', message('no es JSON'));
  await fireEvent(screen.getByTestId('webview'), 'message', message({ type: 'press', latitude: 'x', longitude: 1 }));
  expect(onPress).not.toHaveBeenCalled();
  expect(onMarkerDragEnd).not.toHaveBeenCalled();
});

it('cambiar el pin lo mueve dentro de la página sin recargarla, y al cargar se vuelve a fijar', async () => {
  const { view } = await renderMap();
  const html = screen.getByTestId('webview').props.source.html;
  injectJavaScript.mockClear();
  await view.rerender(
    <OsmMap initialCenter={LIMA} initialZoom={12} marker={{ latitude: -12.2, longitude: -77.2 }} onPress={jest.fn()} onMarkerDragEnd={jest.fn()} />,
  );
  expect(injected()).toContain('setMarker(-12.2,-77.2)');
  expect(screen.getByTestId('webview').props.source.html).toBe(html);

  injectJavaScript.mockClear();
  await fireEvent(screen.getByTestId('webview'), 'loadEnd');
  expect(injected()).toContain('setMarker(-12.2,-77.2)');
});

it('animateTo centra el mapa en el punto', async () => {
  const { ref } = await renderMap();
  await act(() => ref.current?.animateTo({ latitude: -12.069, longitude: -77.079 }));
  expect(injected()).toContain('flyTo(-12.069,-77.079, 16)');
});

it('si Leaflet no carga (sin internet) lo explica', async () => {
  await renderMap();
  await fireEvent(screen.getByTestId('webview'), 'message', message({ type: 'error' }));
  expect(screen.getByText(/No se pudo cargar el mapa/)).toBeTruthy();
});

it('no navega fuera de la página (p. ej. el enlace de créditos)', async () => {
  await renderMap();
  const allow = screen.getByTestId('webview').props.onShouldStartLoadWithRequest;
  expect(allow({ url: 'https://www.openstreetmap.org/copyright' })).toBe(false);
  expect(allow({ url: 'about:blank' })).toBe(true);
});
