// Mocks globales para tests.
jest.mock('expo-secure-store', () => {
  const store = new Map<string, string>();
  return {
    getItemAsync: jest.fn(async (k: string) => store.get(k) ?? null),
    setItemAsync: jest.fn(async (k: string, v: string) => void store.set(k, v)),
    deleteItemAsync: jest.fn(async (k: string) => void store.delete(k)),
    __store: store,
  };
});
// AsyncStorage en memoria (mock oficial de la librería). Los tests que lo usan lo vacían con AsyncStorage.clear().
jest.mock('@react-native-async-storage/async-storage', () => require('@react-native-async-storage/async-storage/jest/async-storage-mock'));
jest.mock('expo-clipboard', () => ({ setStringAsync: jest.fn(async () => true) }));

// Selector nativo de fecha/hora: un View con testID `datetimepicker-<modo>` que conserva sus props,
// para que los tests disparen `onChange` con fireEvent(el, 'change', { type: 'set' }, fecha).
jest.mock('@react-native-community/datetimepicker', () => {
  const { createElement } = require('react');
  const { View } = require('react-native');
  const MockDateTimePicker = (props: { mode?: string }) =>
    createElement(View, { ...props, testID: `datetimepicker-${props.mode ?? 'date'}` });
  return { __esModule: true, default: MockDateTimePicker };
});
// Ubicación: cada test fija lo que devuelve (jest.mocked(ExpoLocation).….mockResolvedValue(...)).
jest.mock('expo-location', () => ({
  requestForegroundPermissionsAsync: jest.fn(),
  hasServicesEnabledAsync: jest.fn(),
  getCurrentPositionAsync: jest.fn(),
  reverseGeocodeAsync: jest.fn(),
  geocodeAsync: jest.fn(),
  Accuracy: { Balanced: 3 },
}));

// WebView (OsmMap): un View con testID 'webview' que conserva sus props, para que los tests disparen
// onMessage/onLoadEnd. Lo que se inyecta con injectJavaScript se registra en `__injectJavaScript`.
jest.mock('react-native-webview', () => {
  const { createElement, forwardRef, useImperativeHandle } = require('react');
  const { View } = require('react-native');
  const mockInjectJavaScript = jest.fn();
  const WebView = forwardRef((props: Record<string, unknown>, ref: unknown) => {
    useImperativeHandle(ref, () => ({ injectJavaScript: mockInjectJavaScript }));
    return createElement(View, { ...props, testID: 'webview' });
  });
  return { __esModule: true, default: WebView, WebView, __injectJavaScript: mockInjectJavaScript };
});

// Cámara y galería: cada test fija lo que devuelven (jest.mocked(ImagePicker.launchCameraAsync).mockResolvedValue(...)).
jest.mock('expo-image-picker', () => ({
  requestCameraPermissionsAsync: jest.fn(),
  launchCameraAsync: jest.fn(),
  launchImageLibraryAsync: jest.fn(),
  // Enum real del módulo (ImagePicker.types.d.ts): lo usa scheduleImage.ts para pedir JPEG en vez de HEIC.
  UIImagePickerPreferredAssetRepresentationMode: { Automatic: 'automatic', Compatible: 'compatible', Current: 'current' },
}));

// Gráficos (react-native-gifted-charts): un View por gráfico con testID `chart-<tipo>` que conserva `data`,
// para que los tests lean los valores que se dibujarían.
jest.mock('react-native-gifted-charts', () => {
  const { createElement } = require('react');
  const { View } = require('react-native');
  const chart = (kind: string) => (props: { data?: unknown[] }) => createElement(View, { testID: `chart-${kind}`, data: props.data });
  return { BarChart: chart('bar'), LineChart: chart('line') };
});

// Informes: PDF, compartir y archivos. Cada test puede cambiar lo que devuelven (jest.mocked(...).mockResolvedValueOnce).
jest.mock('expo-print', () => ({
  // Con `base64: true` devuelve también el contenido («%PDF-1.4\n» en base64).
  printToFileAsync: jest.fn(async (options: { base64?: boolean }) => ({
    uri: 'file:///print/aleatorio.pdf',
    numberOfPages: 1,
    ...(options?.base64 ? { base64: 'JVBERi0xLjQK' } : {}),
  })),
}));
jest.mock('expo-sharing', () => ({
  isAvailableAsync: jest.fn(async () => true),
  shareAsync: jest.fn(async () => undefined),
}));
// File en memoria: `__writes` guarda lo escrito por URI y `__encodings` con qué codificación (los tests los leen con
// require('expo-file-system').__writes). `new File('file:///…')` apunta a esa URI; `new File(Paths.cache, nombre)`, a
// file:///cache/<nombre>. moveSync cambia la URI, pero, como en Expo Go, falla si el archivo está fuera de la caché propia
// (p. ej. el PDF que deja expo-print en la caché de Expo Go: «Missing 'READ' permission»).
jest.mock('expo-file-system', () => {
  const mockWrites = new Map<string, string>();
  const mockEncodings = new Map<string, string>();
  class MockFile {
    uri: string;
    constructor(...parts: unknown[]) {
      const last = String(parts[parts.length - 1]);
      this.uri = parts.length === 1 && last.startsWith('file://') ? last : `file:///cache/${last}`;
    }
    get exists() {
      return mockWrites.has(this.uri);
    }
    create = jest.fn();
    write = jest.fn((content: string, options?: { encoding?: string }) => {
      mockWrites.set(this.uri, content);
      mockEncodings.set(this.uri, options?.encoding ?? 'utf8');
    });
    delete = jest.fn(() => {
      mockWrites.delete(this.uri);
    });
    moveSync = jest.fn((destination: MockFile) => {
      if (!this.uri.startsWith('file:///cache/')) {
        throw new Error("Call to function 'FileSystemFile.moveSync' has been rejected. → Caused by: Missing 'READ' permission");
      }
      this.uri = destination.uri;
    });
  }
  return { File: MockFile, Paths: { cache: { uri: 'file:///cache/' } }, __writes: mockWrites, __encodings: mockEncodings };
});

// TanStack Query avisa a los componentes en un setTimeout(0); en los tests, al momento, para que act() lo incluya.
// eslint-disable-next-line @typescript-eslint/no-require-imports
require('@tanstack/react-query').notifyManager.setScheduler((callback: () => void) => callback());

// Sensor de proximidad (módulo nativo local): cada test fija isAvailable y avisa con __emit(near) a los listeners activos.
// addProximityListener devuelve una suscripción con `remove` como jest.fn, para comprobar que se deja de escuchar.
type MockProximityListener = (change: { near: boolean }) => void;
jest.mock('./modules/proximity', () => {
  const mockListeners = new Set<MockProximityListener>();
  return {
    isAvailable: jest.fn(() => true),
    addProximityListener: jest.fn((listener: MockProximityListener) => {
      mockListeners.add(listener);
      return { remove: jest.fn(() => void mockListeners.delete(listener)) };
    }),
    __emit: (near: boolean) => mockListeners.forEach((listener) => listener({ near })),
  };
});

// Giroscopio (expo-sensors): cada test fija isAvailableAsync y avisa con __emit({x,y,z}) a los listeners activos.
type MockGyroscopeListener = (reading: { x: number; y: number; z: number }) => void;
jest.mock('expo-sensors', () => {
  const mockGyroListeners = new Set<MockGyroscopeListener>();
  return {
    Gyroscope: {
      isAvailableAsync: jest.fn(async () => true),
      setUpdateInterval: jest.fn(),
      addListener: jest.fn((listener: MockGyroscopeListener) => {
        mockGyroListeners.add(listener);
        return { remove: jest.fn(() => void mockGyroListeners.delete(listener)) };
      }),
      __emit: (reading: { x: number; y: number; z: number }) => mockGyroListeners.forEach((listener) => listener(reading)),
    },
  };
});

// Notificaciones push: cada test fija permisos y token (jest.mocked(Notifications.getPermissionsAsync).mockResolvedValue(...)).
jest.mock('expo-notifications', () => ({
  AndroidImportance: { HIGH: 4 },
  setNotificationChannelAsync: jest.fn(async () => null),
  getPermissionsAsync: jest.fn(async () => ({ status: 'granted', granted: true })),
  requestPermissionsAsync: jest.fn(async () => ({ status: 'granted', granted: true })),
  DEFAULT_ACTION_IDENTIFIER: 'expo.modules.notifications.actions.DEFAULT',
  setNotificationHandler: jest.fn(),
  addNotificationReceivedListener: jest.fn(() => ({ remove: jest.fn() })),
  addNotificationResponseReceivedListener: jest.fn(() => ({ remove: jest.fn() })),
  getLastNotificationResponseAsync: jest.fn(async () => null),
  getExpoPushTokenAsync: jest.fn(async () => ({ type: 'expo', data: 'ExponentPushToken[abc]' })),
}));
// expo-constants: app instalada (no Expo Go) con el projectId de EAS; un test cambia executionEnvironment a 'storeClient'.
jest.mock('expo-constants', () => ({
  __esModule: true,
  default: { executionEnvironment: 'standalone', expoConfig: { extra: { eas: { projectId: 'proj-1' } } } },
}));
