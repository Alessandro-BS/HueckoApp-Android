import Constants from 'expo-constants';

import { isExpoGo } from '../notifications/registration';

// La librería tiene código nativo que Expo Go no trae: se carga con `require` solo cuando hace falta.
type GoogleModule = typeof import('@react-native-google-signin/google-signin');
const loadGoogle = (): GoogleModule => require('@react-native-google-signin/google-signin');

const webClientId = () => {
  const id = Constants.expoConfig?.extra?.googleWebClientId;
  return typeof id === 'string' ? id : '';
};

/** Falso en Expo Go (sin el módulo nativo) o sin `extra.googleWebClientId` en app.json. */
export const isGoogleSignInAvailable = (): boolean => !isExpoGo() && webClientId() !== '';

let configured = false;
const configure = (google: GoogleModule) => {
  if (configured) return;
  google.GoogleSignin.configure({ webClientId: webClientId() });
  configured = true;
};

/** Abre el selector de cuentas de Google. Devuelve el idToken, o null si se canceló. Lanza Error con texto para la persona. */
export async function getGoogleIdToken(): Promise<string | null> {
  if (!isGoogleSignInAvailable()) return null;
  const google = loadGoogle();
  const { GoogleSignin, isCancelledResponse, isSuccessResponse, isErrorWithCode, statusCodes } = google;
  try {
    configure(google);
    await GoogleSignin.hasPlayServices({ showPlayServicesUpdateDialog: true });
    const response = await GoogleSignin.signIn();
    if (isCancelledResponse(response)) return null;
    if (isSuccessResponse(response) && response.data.idToken) return response.data.idToken;
    throw new Error('Google no devolvió la cuenta. Inténtalo de nuevo.');
  } catch (e) {
    if (isErrorWithCode(e)) {
      if (e.code === statusCodes.IN_PROGRESS) return null;
      if (e.code === statusCodes.PLAY_SERVICES_NOT_AVAILABLE) {
        throw new Error('Actualiza Google Play Services para continuar con Google.');
      }
    }
    throw e;
  }
}

/** Cierra la cuenta de Google del celular (para que el próximo ingreso deje elegir). Nunca falla. */
export async function signOutGoogle(): Promise<void> {
  if (!isGoogleSignInAvailable()) return;
  try {
    await loadGoogle().GoogleSignin.signOut();
  } catch {
    // Se ignora: cerrar sesión en la app no depende de Google.
  }
}
