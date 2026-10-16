import { render, screen } from '@testing-library/react-native';

import * as adminApi from '../../../api/admin';
import { makeAuditEntry, page } from '../../../testing/adminFixtures';
import { AuditTab } from '../tabs/AuditTab';

jest.mock('../../../api/admin');
jest.mock('../../../hooks/useRefreshOnFocus', () => ({ useRefreshOnFocus: jest.fn() }));
jest.mock('../../../utils/toast', () => ({ showToast: jest.fn() }));
const mocked = adminApi as jest.Mocked<typeof adminApi>;

beforeEach(() => jest.clearAllMocks());

it('cada acción con su objetivo, el motivo, quién y cuándo (hora local)', async () => {
  mocked.listAudit.mockResolvedValue(
    page([
      makeAuditEntry(),
      makeAuditEntry({
        id: 'a2', action: 'PROPOSAL_CANCELLED', admin: null, targetType: 'PROPOSAL', targetId: 'p1', details: { title: 'Fiesta', reason: 'Spam' },
      }),
    ]),
  );
  await render(<AuditTab />);
  expect(await screen.findByText('Suspendió una cuenta')).toBeTruthy();
  expect(screen.getByText('Ana')).toBeTruthy();
  expect(screen.getByText('Administración HueckoApp · Mar 29 sep, 10:00')).toBeTruthy();
  expect(screen.getByText('Canceló una propuesta')).toBeTruthy();
  expect(screen.getByText('Fiesta')).toBeTruthy();
  expect(screen.getByText('Motivo: Spam')).toBeTruthy();
  expect(screen.getByText('Consola del servidor · Mar 29 sep, 10:00')).toBeTruthy();
  expect(mocked.listAudit).toHaveBeenCalledWith(1);
});

it('sin acciones lo dice', async () => {
  mocked.listAudit.mockResolvedValue(page([]));
  await render(<AuditTab />);
  expect(await screen.findByText('Todavía no hay acciones registradas.')).toBeTruthy();
});
