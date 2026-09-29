import { fireEvent, render, screen } from '@testing-library/react-native';

import * as proposalsApi from '../../../api/proposals';
import { makeConfirmed, makeProposal } from '../../../testing/fixtures';
import { PlansTab } from '../tabs/PlansTab';

jest.mock('../../../api/proposals');
jest.mock('../../../hooks/useRefreshOnFocus', () => ({ useRefreshOnFocus: jest.fn() }));
jest.mock('../../../utils/toast', () => ({ showToast: jest.fn() }));
jest.mock('../../../utils/clock', () => ({ today: () => new Date(2026, 8, 29, 10, 0) }));
const mockNavigate = jest.fn();
jest.mock('@react-navigation/native', () => ({
  ...jest.requireActual('@react-navigation/native'),
  useNavigation: () => ({ navigate: mockNavigate }),
}));

const mocked = proposalsApi as jest.Mocked<typeof proposalsApi>;

beforeEach(() => jest.clearAllMocks());

it('lista las propuestas no canceladas con su estado, su plazo o su fecha, y navega', async () => {
  mocked.listGroupProposals.mockResolvedValue([
    makeProposal(),
    makeConfirmed(),
    makeProposal({ id: 'p3', title: 'Plan cancelado', state: 'CANCELADO' }),
  ]);
  await render(<PlansTab groupId="g1" groupName="Proyecto Integrador" />);

  expect(await screen.findByText('Repaso antes de la entrega')).toBeTruthy();
  expect(screen.getByText('Google Meet')).toBeTruthy();
  expect(screen.getByText('En votación')).toBeTruthy();
  expect(screen.getByText('Cierra: Mar 29 sep, 20:00')).toBeTruthy();
  expect(screen.getByText('Reunión de avance del proyecto')).toBeTruthy();
  expect(screen.getByText('Confirmado')).toBeTruthy();
  expect(screen.getByText('Mié 30 sep · 11:00 - 13:00')).toBeTruthy();
  expect(screen.queryByText('Plan cancelado')).toBeNull();
  // G3: sin botón «Votación» ni «Llamadas a la votación».
  expect(screen.queryByText('Votación')).toBeNull();
  expect(screen.queryByText('Llamadas a la votación')).toBeNull();

  await fireEvent.press(screen.getAllByText('Ver detalles')[1]);
  expect(mockNavigate).toHaveBeenCalledWith('PlanDetail', { proposalId: 'prop_1' });
  // «Votar» solo aparece en la que sigue abierta.
  expect(screen.getAllByText('Votar')).toHaveLength(1);
  await fireEvent.press(screen.getByText('Votar'));
  expect(mockNavigate).toHaveBeenCalledWith('Voting', { proposalId: 'prop_2' });
  await fireEvent.press(screen.getByText('Crear propuesta'));
  expect(mockNavigate).toHaveBeenCalledWith('CreateProposal', { groupId: 'g1', groupName: 'Proyecto Integrador' });
});

it('sin propuestas muestra el texto vacío (con tildes)', async () => {
  mocked.listGroupProposals.mockResolvedValue([]);
  await render(<PlansTab groupId="g1" groupName="Proyecto Integrador" />);
  expect(await screen.findByText('Nadie ha propuesto un plan todavía.')).toBeTruthy();
});
