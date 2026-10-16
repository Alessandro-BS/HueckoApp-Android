import type { Dashboard } from '@hueckoapp/shared';

import { api } from './client';

export const getDashboard = async () => (await api.get<Dashboard>('/me/dashboard')).data;
