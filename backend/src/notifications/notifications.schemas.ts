import { z } from 'zod';

// Token de Expo: ExponentPushToken[...] (Expo Go y builds) o ExpoPushToken[...].
export const pushDeviceInputSchema = z.object({
  token: z.string().trim().regex(/^Expo(nent)?PushToken\[.+\]$/, 'Token de notificaciones inválido'),
});
