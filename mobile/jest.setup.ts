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
  Accuracy: { Balanced: 3 },
}));

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
