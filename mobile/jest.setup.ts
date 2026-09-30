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
}));
