import { fireEvent, render, screen, waitFor } from '@testing-library/react-native';

import * as adminApi from '../../../api/admin';
import { makeUserSummary, page } from '../../../testing/adminFixtures';
import { UsersTab } from '../tabs/UsersTab';

jest.mock('../../../api/admin');
jest.mock('../../../hooks/useRefreshOnFocus', () => ({ useRefreshOnFocus: jest.fn() }));
jest.mock('../../../utils/toast', () => ({ showToast: jest.fn() }));
const mocked = adminApi as jest.Mocked<typeof adminApi>;

beforeEach(() => jest.clearAllMocks());

it('lista las cuentas con sus marcas, busca y abre el detalle', async () => {
  const onOpen = jest.fn();
  mocked.listAdminUsers.mockResolvedValue(
    page([
      makeUserSummary(),
      makeUserSummary({ id: 'u9', name: 'Administración HueckoApp', email: 'admin@test.com', role: 'ADMIN' }),
      makeUserSummary({ id: 'u3', name: 'Carlos', email: 'carlos@test.com', status: 'SUSPENDED' }),
    ]),
  );
  await render(<UsersTab onOpen={onOpen} />);
  expect(await screen.findByText('Ana')).toBeTruthy();
  expect(screen.getByText('3 cuentas')).toBeTruthy();
  expect(screen.getByText('Administrador')).toBeTruthy();
  expect(screen.getByText('Suspendida')).toBeTruthy();
  expect(screen.queryByText('Página 1 de 1')).toBeNull(); // una sola página: sin paginador

  await fireEvent.changeText(screen.getByLabelText('Buscar usuarios'), ' carlos ');
  await fireEvent.press(screen.getByText('Buscar'));
  await waitFor(() => expect(mocked.listAdminUsers).toHaveBeenLastCalledWith('carlos', 1));
  await fireEvent.press(await screen.findByText('Ana'));
  expect(onOpen).toHaveBeenCalledWith(makeUserSummary());
});

it('con varias páginas, «Siguiente» pide la 2; sin resultados lo dice con el texto buscado', async () => {
  mocked.listAdminUsers
    .mockResolvedValueOnce(page([makeUserSummary()], { total: 45 }))
    .mockResolvedValueOnce(page([makeUserSummary({ id: 'u5', name: 'Eva' })], { page: 2, total: 45 }))
    .mockResolvedValueOnce(page([], { total: 0 }));
  await render(<UsersTab onOpen={jest.fn()} />);
  expect(await screen.findByText('Página 1 de 3')).toBeTruthy();
  await fireEvent.press(screen.getByText('Siguiente'));
  expect(await screen.findByText('Eva')).toBeTruthy();
  expect(mocked.listAdminUsers).toHaveBeenLastCalledWith('', 2);
  expect(screen.getByText('Página 2 de 3')).toBeTruthy();
  await fireEvent.changeText(screen.getByLabelText('Buscar usuarios'), 'zzz');
  await fireEvent(screen.getByLabelText('Buscar usuarios'), 'submitEditing');
  expect(await screen.findByText('Ninguna cuenta coincide con «zzz».')).toBeTruthy();
});
