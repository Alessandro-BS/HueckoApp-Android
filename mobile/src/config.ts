// URL del backend. Se define en mobile/.env (ver .env.example).
// Emulador Android: http://10.0.2.2:3000/api · Celular físico: http://<IP-de-tu-PC>:3000/api
export const API_URL = process.env.EXPO_PUBLIC_API_URL ?? 'http://10.0.2.2:3000/api';
