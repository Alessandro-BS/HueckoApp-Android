// URL del backend. Se define en mobile/.env (ver .env.example).
// Emulador Android: http://10.0.2.2:3000/api · Celular físico: http://<IP-de-tu-PC>:3000/api
export const API_URL = process.env.EXPO_PUBLIC_API_URL ?? 'http://10.0.2.2:3000/api';

// Funciones a medio terminar: se ven en la app, pero desactivadas y marcadas «en curso».
// mapPicker: «Elegir en el mapa» (OsmMap + PlacePickerModal). Funciona; falta el buscador con sugerencias.
export const features = { mapPicker: false };
