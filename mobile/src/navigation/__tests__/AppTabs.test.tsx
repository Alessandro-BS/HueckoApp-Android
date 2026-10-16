import { render, screen } from '@testing-library/react-native';
import type { ReactNode } from 'react';

import { AppTabs } from '../AppTabs';

// Barra inferior de mentira: pinta el título de cada pestaña registrada y guarda las opciones del navegador.
const mockNavigatorProps = jest.fn();
jest.mock('@react-navigation/bottom-tabs', () => {
  const { createElement, Fragment } = require('react');
  const { Text } = require('react-native');
  return {
    createBottomTabNavigator: () => ({
      Navigator: ({ children, ...props }: { children: ReactNode }) => {
        mockNavigatorProps(props);
        return createElement(Fragment, null, children);
      },
      Screen: ({ name, options }: { name: string; options?: { title?: string } }) => createElement(Text, null, options?.title ?? name),
    }),
  };
});
jest.mock('@react-navigation/drawer', () => ({ DrawerToggleButton: () => null }));

it('la barra inferior tiene Inicio, Horario y Grupos, en ese orden', async () => {
  await render(<AppTabs />);
  expect(screen.getAllByText(/^(Inicio|Horario|Grupos)$/).map((node) => node.props.children)).toEqual(['Inicio', 'Horario', 'Grupos']);
});

it('cada pestaña lleva el botón ☰ que abre el drawer', async () => {
  await render(<AppTabs />);
  const { screenOptions } = mockNavigatorProps.mock.calls[0][0];
  expect(typeof screenOptions.headerLeft).toBe('function');
});
