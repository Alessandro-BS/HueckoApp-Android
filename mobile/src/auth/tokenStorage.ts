import * as SecureStore from 'expo-secure-store';

// El token vive cifrado en el Keystore de Android (Keychain en iOS). Nunca en AsyncStorage.
const KEY = 'hueckoapp.token';

export const tokenStorage = {
  get: () => SecureStore.getItemAsync(KEY),
  set: (token: string) => SecureStore.setItemAsync(KEY, token),
  clear: () => SecureStore.deleteItemAsync(KEY),
};
