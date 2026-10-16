import AsyncStorage from '@react-native-async-storage/async-storage';
import type { CurrentUser } from '@hueckoapp/shared';

import type { DashboardData } from '../hooks/useDashboard';

// AsyncStorage guarda texto SIN cifrar: aquí solo van datos que no son secretos (el último correo usado, el perfil
// de la sesión y una copia de Inicio, para abrir la app y mostrarla sin red). El token va aparte, cifrado
// (auth/tokenStorage.ts). Si el almacenamiento falla, la app sigue igual: leer devuelve null y escribir no lanza.
const LAST_EMAIL_KEY = 'hueckoapp.lastEmail';
const SESSION_USER_KEY = 'hueckoapp.sessionUser';
const DASHBOARD_PREFIX = 'hueckoapp.dashboard.';

const read = async <T>(key: string): Promise<T | null> => {
  try {
    const raw = await AsyncStorage.getItem(key);
    return raw === null ? null : (JSON.parse(raw) as T);
  } catch {
    return null;
  }
};

const write = async (key: string, value: unknown) => {
  try {
    await AsyncStorage.setItem(key, JSON.stringify(value));
  } catch {
    // Sin copia local no se pierde nada: los datos siguen en el servidor.
  }
};

/** Último correo con el que se inició sesión: rellena el campo del login. Se conserva al cerrar sesión. */
export const lastEmailStorage = {
  get: () => read<string>(LAST_EMAIL_KEY),
  set: (email: string) => write(LAST_EMAIL_KEY, email),
};

/**
 * Perfil de la sesión abierta (nombre, correo y rol; nunca el token): permite entrar a la app sin red con la sesión
 * guardada. Se borra al cerrar sesión. El rol es solo para mostrar el menú: el servidor lo revisa en cada petición.
 */
export const sessionUserStorage = {
  get: () => read<CurrentUser>(SESSION_USER_KEY),
  set: (user: CurrentUser) => write(SESSION_USER_KEY, user),
  clear: async () => {
    try {
      await AsyncStorage.removeItem(SESSION_USER_KEY);
    } catch {
      // Se vuelve a intentar en el próximo cierre de sesión.
    }
  },
};

/** Copia de Inicio por usuario. Se borra al cerrar sesión: en un teléfono compartido, nadie ve la de otro. */
export const dashboardCache = {
  get: (userId: string) => read<DashboardData>(DASHBOARD_PREFIX + userId),
  set: (userId: string, data: DashboardData) => write(DASHBOARD_PREFIX + userId, data),
  clearAll: async () => {
    try {
      const keys = (await AsyncStorage.getAllKeys()).filter((k) => k.startsWith(DASHBOARD_PREFIX));
      if (keys.length > 0) await AsyncStorage.multiRemove(keys);
    } catch {
      // Se vuelve a intentar en el próximo cierre de sesión.
    }
  },
};
