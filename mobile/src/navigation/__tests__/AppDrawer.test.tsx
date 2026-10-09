import { render, screen } from '@testing-library/react-native';
import type { ReactNode } from 'react';

import { ADMIN_USER } from '../../testing/adminFixtures';
import { TEST_USER } from '../../testing/fixtures';
import { AppDrawer } from '../AppDrawer';

const mockUseAuth = jest.fn();
jest.mock('../../context/AuthContext', () => ({ useAuth: () => mockUseAuth() }));
// La barra inferior se prueba en AppTabs.test.tsx.
jest.mock('../AppTabs', () => ({ AppTabs: () => null }));

// Drawer de mentira (el real necesita gestos y animaciones nativas): pinta el título de cada pantalla registrada.
// Aquí solo importa qué entradas registra AppDrawer según el rol.
jest.mock('@react-navigation/drawer', () => {
  const { createElement, Fragment } = require('react');
  const { Text } = require('react-native');
  return {
    createDrawerNavigator: () => ({
      Navigator: ({ children }: { children: ReactNode }) => createElement(Fragment, null, children),
      Screen: ({ name, options }: { name: string; options?: { title?: string } }) => createElement(Text, null, options?.title ?? name),
    }),
    DrawerContentScrollView: () => null,
    DrawerItem: () => null,
    DrawerItemList: () => null,
  };
});

beforeEach(() => jest.clearAllMocks());

it('USER no ve «Administración» en el menú', async () => {
  mockUseAuth.mockReturnValue({ user: { ...TEST_USER, role: 'USER' }, logout: jest.fn() });
  await render(<AppDrawer />);
  expect(screen.getByText('Perfil')).toBeTruthy(); // control: el menú sí está pintado
  expect(screen.queryByText('Administración')).toBeNull();
});

it('ADMIN sí lo ve (D12)', async () => {
  mockUseAuth.mockReturnValue({ user: { ...ADMIN_USER, role: 'ADMIN' }, logout: jest.fn() });
  await render(<AppDrawer />);
  expect(screen.getByText('Administración')).toBeTruthy();
});

it('Horario y Grupos ya no están en el drawer: viven en la barra inferior, dentro de «Inicio»', async () => {
  mockUseAuth.mockReturnValue({ user: { ...TEST_USER, role: 'USER' }, logout: jest.fn() });
  await render(<AppDrawer />);
  expect(screen.getByText('Inicio')).toBeTruthy();
  expect(screen.queryByText('Horario')).toBeNull();
  expect(screen.queryByText('Grupos')).toBeNull();
});
