import { z } from 'zod';

// Token de Expo: ExponentPushToken[...] (Expo Go y builds) o ExpoPushToken[...].
export const pushDeviceInputSchema = z.object({
  token: z.string().trim().max(255, 'Token de notificaciones inválido').regex(/^Expo(nent)?PushToken\[.+\]$/, 'Token de notificaciones inválido'),
});
