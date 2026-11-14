import Constants from 'expo-constants';
import * as Notifications from 'expo-notifications';

import { ApiError } from '../api/client';
import { registerPushDevice, unregisterPushDevice } from '../api/notifications';
import { pushTokenStorage } from '../storage/appStorage';

export type RegisterResult = 'registered' | 'denied' | 'unavailable';

// Expo Go (SDK 53+) ya no admite notificaciones push remotas: solo funcionan en la app instalada.
export const isExpoGo = () => Constants.executionEnvironment === 'storeClient';

/** Pide permiso, obtiene el token de Expo y lo registra en el servidor. Nunca lanza. */
export async function registerDevice(): Promise<RegisterResult> {
  if (isExpoGo()) return 'unavailable';
  try {
    // En Android 13+ el canal debe existir antes de pedir el permiso.
    await Notifications.setNotificationChannelAsync('planes', {
      name: 'Planes',
      importance: Notifications.AndroidImportance.HIGH,
    });
    let permission = await Notifications.getPermissionsAsync();
    if (!permission.granted) permission = await Notifications.requestPermissionsAsync();
    if (!permission.granted) return 'denied';
    const projectId = Constants.expoConfig?.extra?.eas?.projectId as string | undefined;
    const { data: token } = await Notifications.getExpoPushTokenAsync({ projectId });
    await pushTokenStorage.set(token);
    await registerPushDevice(token);
    return 'registered';
  } catch {
    return 'unavailable';
  }
}

/**
 * Borra este celular en el servidor (necesita el JWT puesto). Por defecto (interruptor de Perfil) el token se olvida
 * solo si el servidor lo borró (un 404 cuenta: ya no lo conocía); si falla, queda guardado y se reintenta al abrir la
 * app. Con `forgetAlways` (cerrar sesión) se olvida antes del DELETE y se ignoran los errores: si el DELETE responde
 * 401, el interceptor cierra la sesión y vuelve a pasar por aquí, y sin JWT no habría reintento.
 */
export async function unregisterDevice({ forgetAlways = false }: { forgetAlways?: boolean } = {}): Promise<void> {
  const token = await pushTokenStorage.get();
  if (!token) return;
  if (forgetAlways) await pushTokenStorage.clear();
  try {
    await unregisterPushDevice(token);
  } catch (e) {
    if (!(e instanceof ApiError && e.status === 404)) return;
  }
  await pushTokenStorage.clear();
}
