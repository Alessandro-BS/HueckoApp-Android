import Constants from 'expo-constants';
import * as Notifications from 'expo-notifications';

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

/** Borra este celular en el servidor (necesita el JWT puesto) y olvida el token. Los errores se ignoran. */
export async function unregisterDevice(): Promise<void> {
  const token = await pushTokenStorage.get();
  if (!token) return;
  // Se olvida primero: si el DELETE responde 401, el interceptor cierra la sesión y vuelve a pasar por aquí.
  await pushTokenStorage.clear();
  try {
    await unregisterPushDevice(token);
  } catch {
    // Sin red o sesión ya vencida: el servidor deja de enviar a tokens que Expo rechaza.
  }
}
