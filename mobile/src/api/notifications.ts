import type { PushDeviceInput } from '@hueckoapp/shared';

import { api } from './client';

export const registerPushDevice = async (token: string) => {
  const body: PushDeviceInput = { token };
  await api.put('/me/push-devices', body);
};

// El token lleva corchetes: va con encodeURIComponent. Timeout corto: al cerrar sesión no se espera al servidor.
export const unregisterPushDevice = async (token: string) => {
  await api.delete(`/me/push-devices/${encodeURIComponent(token)}`, { timeout: 5_000 });
};
