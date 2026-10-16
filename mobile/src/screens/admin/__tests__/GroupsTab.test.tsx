import { fireEvent, render, screen, waitFor } from '@testing-library/react-native';

import * as adminApi from '../../../api/admin';
import { makeGroupSummary, page } from '../../../testing/adminFixtures';
import { GroupsTab } from '../tabs/GroupsTab';

jest.mock('../../../api/admin');
jest.mock('../../../hooks/useRefreshOnFocus', () => ({ useRefreshOnFocus: jest.fn() }));
jest.mock('../../../utils/toast', () => ({ showToast: jest.fn() }));
const mocked = adminApi as jest.Mocked<typeof adminApi>;

beforeEach(() => jest.clearAllMocks());

it('cada grupo con miembros, propuestas y quién lo administra; busca y abre el detalle', async () => {
  const onOpen = jest.fn();
  mocked.listAdminGroups.mockResolvedValue(page([makeGroupSummary(), makeGroupSummary({ id: 'g2', name: 'Sin gente', memberCount: 0, proposalCount: 0, owner: null })]));
  await render(<GroupsTab onOpen={onOpen} />);
  expect(await screen.findByText('Proyecto Integrador')).toBeTruthy();
  expect(screen.getByText('2 miembros · 1 propuesta')).toBeTruthy();
  expect(screen.getByText('Administra: Usuario de Prueba')).toBeTruthy();
  expect(screen.getByText('Sin administrador')).toBeTruthy();
  await fireEvent.changeText(screen.getByLabelText('Buscar grupos'), 'proy');
  await fireEvent.press(screen.getByText('Buscar'));
  await waitFor(() => expect(mocked.listAdminGroups).toHaveBeenLastCalledWith('proy', 1));
  await fireEvent.press(await screen.findByText('Proyecto Integrador'));
  expect(onOpen).toHaveBeenCalledWith(makeGroupSummary());
});
