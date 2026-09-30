import { createNavigationContainerRef, NavigationContainer } from '@react-navigation/native';
import { render } from '@testing-library/react-native';

import { ADMIN_USER } from '../../testing/adminFixtures';
import { TEST_USER } from '../../testing/fixtures';
import { RootNavigator } from '../RootNavigator';

const mockUseAuth = jest.fn();
jest.mock('../../context/AuthContext', () => ({ useAuth: () => mockUseAuth() }));
// El drawer (y sus pantallas) no importa aquí: solo qué rutas registra el stack según el rol.
jest.mock('../AppDrawer', () => ({ AppDrawer: () => null }));

const routeNames = async (role: 'USER' | 'ADMIN') => {
  mockUseAuth.mockReturnValue({ status: 'signedIn', user: role === 'ADMIN' ? { ...ADMIN_USER, role } : { ...TEST_USER, role } });
  const ref = createNavigationContainerRef();
  await render(
    <NavigationContainer ref={ref}>
      <RootNavigator />
    </NavigationContainer>,
  );
  return ref.getRootState()?.routeNames ?? [];
};

// M3 (defensa en profundidad): para USER, los detalles de administración ni siquiera existen como rutas.
// Si una admin pierde el rol, el stack los quita y vuelve a la pantalla anterior.
it('USER: sin AdminUserDetail ni AdminGroupDetail', async () => {
  const names = await routeNames('USER');
  expect(names).toContain('GroupDetail'); // control positivo
  expect(names).not.toContain('AdminUserDetail');
  expect(names).not.toContain('AdminGroupDetail');
});

it('ADMIN: con los dos', async () => {
  expect(await routeNames('ADMIN')).toEqual(expect.arrayContaining(['AdminUserDetail', 'AdminGroupDetail']));
});
