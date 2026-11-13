import type { Group } from '@hueckoapp/shared';
import { NavigationContainer } from '@react-navigation/native';
import { fireEvent, render, screen } from '@testing-library/react-native';

import { GroupDetailScreen } from '../GroupDetailScreen';

const mockGroup: Group = {
  id: 'g1', name: 'Proyecto Integrador', description: '', memberCount: 2, availabilityThreshold: 80, inviteCode: 'PROY2026',
  members: [{ id: 'u1', name: 'Usuario de Prueba', email: 'test@test.com', role: 'ORGANIZER', isEssential: false }],
};

jest.mock('../../../hooks/useGroup', () => ({
  useGroup: () => ({ group: mockGroup, loading: false, refreshing: false, error: null, reload: jest.fn(), setEssential: jest.fn(), leave: jest.fn() }),
}));
jest.mock('../../../hooks/useAvailability', () => ({
  useAvailability: () => ({ windows: [], loaded: true, loading: false, refreshing: false, error: null, reload: jest.fn() }),
}));
jest.mock('../../../hooks/useProposals', () => ({
  useProposals: () => ({ proposals: [], loaded: true, loading: false, refreshing: false, error: null, reload: jest.fn() }),
}));
jest.mock('../../../context/AuthContext', () => ({ useAuth: () => ({ user: { id: 'u1' } }) }));

// La barra de pestañas pinta cada etiqueta dos veces (activa e inactiva, para el fundido), de ahí getAllByText.
it('muestra el nombre, el código de invitación y las tres pestañas', async () => {
  const navigation = { setOptions: jest.fn(), goBack: jest.fn() } as any;
  const route = { key: 'k', name: 'GroupDetail', params: { groupId: 'g1', name: 'Proyecto Integrador' } } as any;
  await render(
    <NavigationContainer>
      <GroupDetailScreen navigation={navigation} route={route} />
    </NavigationContainer>,
  );
  expect(screen.getByText('Proyecto Integrador')).toBeTruthy();
  expect(screen.getByText('PROY2026')).toBeTruthy();
  expect(screen.getAllByText('Planes').length).toBeGreaterThan(0);
  expect(screen.getAllByText('Huecos').length).toBeGreaterThan(0);
  expect(screen.getAllByText('Miembros').length).toBeGreaterThan(0);
});

it('«Acercar para invitar» abre la pantalla de proximidad con el grupo', async () => {
  const navigation = { setOptions: jest.fn(), goBack: jest.fn(), navigate: jest.fn() } as any;
  const route = { key: 'k', name: 'GroupDetail', params: { groupId: 'g1', name: 'Proyecto Integrador' } } as any;
  await render(
    <NavigationContainer>
      <GroupDetailScreen navigation={navigation} route={route} />
    </NavigationContainer>,
  );
  await fireEvent.press(screen.getByText('Acercar para invitar'));
  expect(navigation.navigate).toHaveBeenCalledWith('ProximityInvite', { groupId: 'g1', name: 'Proyecto Integrador' });
});
