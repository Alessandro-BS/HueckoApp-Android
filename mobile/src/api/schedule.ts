import type { TimeBlock, TimeBlockInput } from '@hueckoapp/shared';

import { api } from './client';

export type { TimeBlockInput };

export const listTimeBlocks = async () => (await api.get<TimeBlock[]>('/me/time-blocks')).data;

export const createTimeBlock = async (input: TimeBlockInput) =>
  (await api.post<TimeBlock>('/me/time-blocks', input)).data;

export const deleteTimeBlock = async (id: string): Promise<void> => {
  await api.delete(`/me/time-blocks/${encodeURIComponent(id)}`);
};
