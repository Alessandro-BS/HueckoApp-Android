import AsyncStorage from '@react-native-async-storage/async-storage';
import type { CurrentUser } from '@hueckoapp/shared';

import type { DashboardData } from '../hooks/useDashboard';

// AsyncStorage guarda texto SIN cifrar: aquí solo van datos que no son secretos (el último correo usado, el perfil
// de la sesión y una copia de Inicio, para abrir la app y mostrarla sin red). El token va aparte, cifrado
// (auth/tokenStorage.ts). Si el almacenamiento falla, la app sigue igual: leer devuelve null y escribir no lanza.
const LAST_EMAIL_KEY = 'hueckoapp.lastEmail';
const SESSION_USER_KEY = 'hueckoapp.sessionUser';
const DASHBOARD_PREFIX = 'hueckoapp.dashboard.';
// Sube si cambia la forma de DashboardData: una copia de otra versión de la app se ignora en vez de romper Inicio.
const DASHBOARD_CACHE_VERSION = 1;

const isRecord = (v: unknown): v is Record<string, unknown> => typeof v === 'object' && v !== null;

// Lo mínimo que Inicio lee sin comprobar: si falta, la copia no se usa (se espera al servidor).
const isDashboardData = (v: unknown): v is DashboardData =>
  isRecord(v) &&
  Array.isArray(v.blocks) &&
  isRecord(v.dashboard) &&
  isRecord(v.dashboard.metrics) &&
  Array.isArray(v.dashboard.groups) &&
  Array.isArray(v.dashboard.pendingVotes);

const isCurrentUser = (v: unknown): v is CurrentUser =>
  isRecord(v) &&
  typeof v.id === 'string' &&
  typeof v.name === 'string' &&
  typeof v.email === 'string' &&
  (v.role === 'USER' || v.role === 'ADMIN');

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
  get: async () => {
    const saved = await read<unknown>(SESSION_USER_KEY);
    return isCurrentUser(saved) ? saved : null;
  },
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
  get: async (userId: string) => {
    const saved = await read<{ v?: unknown; data?: unknown }>(DASHBOARD_PREFIX + userId);
    return saved?.v === DASHBOARD_CACHE_VERSION && isDashboardData(saved.data) ? saved.data : null;
  },
  set: (userId: string, data: DashboardData) => write(DASHBOARD_PREFIX + userId, { v: DASHBOARD_CACHE_VERSION, data }),
  clearAll: async () => {
    try {
      const keys = (await AsyncStorage.getAllKeys()).filter((k) => k.startsWith(DASHBOARD_PREFIX));
      if (keys.length > 0) await AsyncStorage.multiRemove(keys);
    } catch {
      // Se vuelve a intentar en el próximo cierre de sesión.
    }
  },
};
