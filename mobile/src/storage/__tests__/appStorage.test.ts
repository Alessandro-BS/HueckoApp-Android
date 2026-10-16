import AsyncStorage from '@react-native-async-storage/async-storage';

import { makeDashboard } from '../../testing/fixtures';
import { dashboardCache, sessionUserStorage } from '../appStorage';

const ana = { id: 'u1', name: 'Ana', email: 'ana@correo.com', role: 'USER' as const };

beforeEach(async () => {
  await AsyncStorage.clear();
});

it('la copia de Inicio vuelve tal cual se guardó', async () => {
  const data = { dashboard: makeDashboard(), blocks: [] };
  await dashboardCache.set('u1', data);
  expect(await dashboardCache.get('u1')).toEqual(data);
});

it.each([
  ['de una versión anterior (sin versión)', { dashboard: makeDashboard(), blocks: [] }],
  ['de otra versión', { v: 99, data: { dashboard: makeDashboard(), blocks: [] } }],
  ['con otra forma', { v: 1, data: { dashboard: { metrics: null }, blocks: [] } }],
  ['que no es un objeto', { v: 1, data: 'hola' }],
])('una copia %s se ignora en vez de romper Inicio', async (_, stored) => {
  await AsyncStorage.setItem('hueckoapp.dashboard.u1', JSON.stringify(stored));
  expect(await dashboardCache.get('u1')).toBeNull();
});

it('JSON roto también se ignora', async () => {
  await AsyncStorage.setItem('hueckoapp.dashboard.u1', '{roto');
  expect(await dashboardCache.get('u1')).toBeNull();
});

it('el perfil de la sesión solo vale con id, nombre, correo y un rol conocido', async () => {
  await sessionUserStorage.set(ana);
  expect(await sessionUserStorage.get()).toEqual(ana);
  await AsyncStorage.setItem('hueckoapp.sessionUser', JSON.stringify({ ...ana, role: 'SUPERADMIN' }));
  expect(await sessionUserStorage.get()).toBeNull();
  await AsyncStorage.setItem('hueckoapp.sessionUser', JSON.stringify({ name: 'Ana' }));
  expect(await sessionUserStorage.get()).toBeNull();
});
