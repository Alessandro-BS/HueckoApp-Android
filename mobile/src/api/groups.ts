import type { Group, GroupMember, GroupSummary, MatchWindow } from '@hueckoapp/shared';

import { api } from './client';

export type CreateGroupInput = { name: string; description?: string; availabilityThreshold?: number };

const groupPath = (id: string) => `/groups/${encodeURIComponent(id)}`;

export const listGroups = async () => (await api.get<GroupSummary[]>('/groups')).data;

export const getGroup = async (id: string) => (await api.get<Group>(groupPath(id))).data;

export const createGroup = async (input: CreateGroupInput) => (await api.post<Group>('/groups', input)).data;

// El servidor también normaliza (G10); aquí se hace para enviar ya el código limpio.
export const joinGroup = async (inviteCode: string) =>
  (await api.post<Group>('/groups/join', { inviteCode: inviteCode.trim().toUpperCase() })).data;

export const setMemberEssential = async (groupId: string, userId: string, isEssential: boolean) =>
  (await api.patch<GroupMember>(`${groupPath(groupId)}/members/${encodeURIComponent(userId)}`, { isEssential })).data;

export const leaveGroup = async (groupId: string): Promise<void> => {
  await api.delete(`${groupPath(groupId)}/members/me`);
};

export const getAvailability = async (groupId: string) =>
  (await api.get<MatchWindow[]>(`${groupPath(groupId)}/availability`)).data;
