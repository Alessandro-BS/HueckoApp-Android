import type { ProximityRequest } from '@hueckoapp/shared';

import { api } from './client';

const proximityPath = (id: string) => `/proximity/${encodeURIComponent(id)}`;

export const sendInvite = async (groupId: string) =>
  (await api.post<ProximityRequest>('/proximity/invite', { groupId })).data;

export const sendJoin = async () => (await api.post<ProximityRequest>('/proximity/join', {})).data;

export const getProximity = async (id: string) => (await api.get<ProximityRequest>(proximityPath(id))).data;

export const acceptProximity = async (id: string) =>
  (await api.post<ProximityRequest>(`${proximityPath(id)}/accept`)).data;

export const rejectProximity = async (id: string) =>
  (await api.post<ProximityRequest>(`${proximityPath(id)}/reject`)).data;

export const cancelProximity = async (id: string): Promise<void> => {
  await api.delete(proximityPath(id));
};

// Despierta al servidor (Render duerme el plan gratuito) antes de juntar los celulares: si el primer aviso lo
// despertara, el segundo llegaría con más de 3 s de diferencia y no se emparejarían. Nunca lanza.
export const pingServer = async (): Promise<void> => {
  try {
    await api.get('/health');
  } catch {
    // Da igual si falla: solo era para despertarlo.
  }
};
