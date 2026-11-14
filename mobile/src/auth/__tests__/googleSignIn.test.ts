import Constants from 'expo-constants';

import { getGoogleIdToken, isGoogleSignInAvailable, signOutGoogle } from '../googleSignIn';

const mockGoogle = {
  configure: jest.fn(),
  hasPlayServices: jest.fn(),
  signIn: jest.fn(),
  signOut: jest.fn(),
};
jest.mock('@react-native-google-signin/google-signin', () => ({
  GoogleSignin: {
    configure: (...a: unknown[]) => mockGoogle.configure(...a),
    hasPlayServices: (...a: unknown[]) => mockGoogle.hasPlayServices(...a),
    signIn: (...a: unknown[]) => mockGoogle.signIn(...a),
    signOut: (...a: unknown[]) => mockGoogle.signOut(...a),
  },
  isSuccessResponse: (r: { type: string }) => r.type === 'success',
  isCancelledResponse: (r: { type: string }) => r.type === 'cancelled',
  isErrorWithCode: (e: unknown) => typeof e === 'object' && e !== null && 'code' in e,
  statusCodes: { IN_PROGRESS: 'IN_PROGRESS', PLAY_SERVICES_NOT_AVAILABLE: 'PLAY_SERVICES_NOT_AVAILABLE' },
}));

const constants = Constants as unknown as { executionEnvironment: string; expoConfig: { extra: Record<string, unknown> } };

beforeEach(() => {
  jest.clearAllMocks();
  constants.executionEnvironment = 'standalone';
  constants.expoConfig.extra.googleWebClientId = 'web-client.apps.googleusercontent.com';
  mockGoogle.hasPlayServices.mockResolvedValue(true);
  mockGoogle.signOut.mockResolvedValue(null);
});

describe('isGoogleSignInAvailable', () => {
  it('es verdadero en la app instalada con webClientId', () => {
    expect(isGoogleSignInAvailable()).toBe(true);
  });
  it('es falso en Expo Go', () => {
    constants.executionEnvironment = 'storeClient';
    expect(isGoogleSignInAvailable()).toBe(false);
  });
  it('es falso sin webClientId', () => {
    constants.expoConfig.extra.googleWebClientId = '';
    expect(isGoogleSignInAvailable()).toBe(false);
  });
});

describe('getGoogleIdToken', () => {
  it('éxito: devuelve el idToken y configura con el webClientId', async () => {
    mockGoogle.signIn.mockResolvedValue({ type: 'success', data: { idToken: 'idt' } });
    await expect(getGoogleIdToken()).resolves.toBe('idt');
    expect(mockGoogle.configure).toHaveBeenCalledWith({ webClientId: 'web-client.apps.googleusercontent.com' });
    expect(mockGoogle.hasPlayServices).toHaveBeenCalledWith({ showPlayServicesUpdateDialog: true });
  });
  it('cancelado: devuelve null', async () => {
    mockGoogle.signIn.mockResolvedValue({ type: 'cancelled', data: null });
    await expect(getGoogleIdToken()).resolves.toBeNull();
  });
  it('éxito sin idToken: error con el texto', async () => {
    mockGoogle.signIn.mockResolvedValue({ type: 'success', data: { idToken: null } });
    await expect(getGoogleIdToken()).rejects.toThrow('Google no devolvió la cuenta. Inténtalo de nuevo.');
  });
  it('Play Services no disponible: error con el texto', async () => {
    mockGoogle.hasPlayServices.mockRejectedValue({ code: 'PLAY_SERVICES_NOT_AVAILABLE' });
    await expect(getGoogleIdToken()).rejects.toThrow('Actualiza Google Play Services para continuar con Google.');
  });
  it('IN_PROGRESS: devuelve null', async () => {
    mockGoogle.signIn.mockRejectedValue({ code: 'IN_PROGRESS' });
    await expect(getGoogleIdToken()).resolves.toBeNull();
  });
  it('no disponible: devuelve null sin tocar la librería', async () => {
    constants.executionEnvironment = 'storeClient';
    await expect(getGoogleIdToken()).resolves.toBeNull();
    expect(mockGoogle.signIn).not.toHaveBeenCalled();
  });
});

describe('signOutGoogle', () => {
  it('cierra la sesión de Google', async () => {
    await signOutGoogle();
    expect(mockGoogle.signOut).toHaveBeenCalled();
  });
  it('nunca falla', async () => {
    mockGoogle.signOut.mockRejectedValue(new Error('x'));
    await expect(signOutGoogle()).resolves.toBeUndefined();
  });
  it('no hace nada si no está disponible', async () => {
    constants.executionEnvironment = 'storeClient';
    await signOutGoogle();
    expect(mockGoogle.signOut).not.toHaveBeenCalled();
  });
});
