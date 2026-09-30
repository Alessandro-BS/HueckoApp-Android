import { fireEvent, render, screen } from '@testing-library/react-native';

import * as aiApi from '../../../api/ai';
import { ApiError } from '../../../api/client';
import * as proposalsApi from '../../../api/proposals';
import { makeConfirmed, makeProposal, makeSuggestion } from '../../../testing/fixtures';
import { PlansTab } from '../tabs/PlansTab';

jest.mock('../../../api/proposals');
jest.mock('../../../api/ai');
jest.mock('../../../hooks/useRefreshOnFocus', () => ({ useRefreshOnFocus: jest.fn() }));
jest.mock('../../../utils/toast', () => ({ showToast: jest.fn() }));
jest.mock('../../../utils/clock', () => ({ today: () => new Date(2026, 8, 29, 10, 0) }));
const mockNavigate = jest.fn();
jest.mock('@react-navigation/native', () => ({
  ...jest.requireActual('@react-navigation/native'),
  useNavigation: () => ({ navigate: mockNavigate }),
}));

const mocked = proposalsApi as jest.Mocked<typeof proposalsApi>;
const mockedAi = aiApi as jest.Mocked<typeof aiApi>;

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

it('«Ideas con IA» muestra 3 ideas y «Usar» abre la propuesta rellenada', async () => {
  mocked.listGroupProposals.mockResolvedValue([]);
  mockedAi.getAiStatus.mockResolvedValue({ provider: 'gemini' });
  mockedAi.suggestPlans.mockResolvedValue({
    suggestions: [
      makeSuggestion(),
      makeSuggestion({ title: 'Almuerzo del grupo', category: 'COMIDA', placeIdea: null, window: null, reason: 'Un plan corto.' }),
      makeSuggestion({
        title: 'Partido de fulbito', category: 'DEPORTE', placeIdea: 'Losa del campus',
        window: { dayOfWeek: 4, startTime: '08:00', endTime: '20:00', availabilityPercentage: 100, freeMembers: 2 },
      }),
    ],
  });
  await render(<PlansTab groupId="g1" groupName="Proyecto Integrador" />);
  await fireEvent.press(await screen.findByText('Ideas con IA'));

  expect(await screen.findByText('Sesión de estudio antes del parcial')).toBeTruthy();
  expect(mockedAi.suggestPlans).toHaveBeenCalledWith('g1');
  expect(screen.getByText('Ideas con Huecko IA')).toBeTruthy();
  expect(screen.getByText('Lun · 12:00 - 20:00')).toBeTruthy();
  expect(screen.getByText('Jue · 08:00 - 20:00')).toBeTruthy();
  expect(screen.getByText('Huecko IA no eligió franja: añade una a mano al crear (o deja que Huecko elija si el grupo tiene huecos en común).')).toBeTruthy();
  expect(screen.getByText('Comida')).toBeTruthy();
  expect(screen.getByText('Un plan corto.')).toBeTruthy();

  // Cada «Usar» nombra su idea para el lector de pantalla.
  expect(screen.getByRole('button', { name: 'Usar «Sesión de estudio antes del parcial»' })).toBeTruthy();
  expect(screen.getByRole('button', { name: 'Usar «Almuerzo del grupo»' })).toBeTruthy();
  const useButton = screen.getByRole('button', { name: 'Usar «Partido de fulbito»' });
  await fireEvent.press(useButton);
  await fireEvent.press(useButton);
  expect(mockNavigate).toHaveBeenCalledTimes(1);
  expect(mockNavigate).toHaveBeenCalledWith('CreateProposal', {
    groupId: 'g1',
    groupName: 'Proyecto Integrador',
    prefill: {
      title: 'Partido de fulbito', placeName: 'Losa del campus', window: { dayOfWeek: 4, startTime: '08:00', endTime: '20:00' },
      votingDeadline: null, category: 'DEPORTE',
    },
  });
  expect(screen.queryByText('Ideas con Huecko IA')).toBeNull();
});

it('si la IA falla: el motivo y «Reintentar»', async () => {
  mocked.listGroupProposals.mockResolvedValue([]);
  mockedAi.suggestPlans
    .mockRejectedValueOnce(new ApiError(429, 'TOO_MANY_REQUESTS', 'Usaste mucho la IA en poco tiempo. Espera unos minutos.'))
    .mockResolvedValueOnce({ suggestions: [makeSuggestion()] });
  await render(<PlansTab groupId="g1" groupName="Proyecto Integrador" />);
  await fireEvent.press(await screen.findByText('Ideas con IA'));
  expect(await screen.findByText('Usaste mucho la IA en poco tiempo. Espera unos minutos.')).toBeTruthy();
  await fireEvent.press(screen.getByText('Reintentar'));
  expect(await screen.findByText('Sesión de estudio antes del parcial')).toBeTruthy();
});
