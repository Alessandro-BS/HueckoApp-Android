import { fireEvent, render, screen, waitFor } from '@testing-library/react-native';

import { ApiError } from '../../../api/client';
import * as proposalsApi from '../../../api/proposals';
import { makeProposal, makeWindow } from '../../../testing/fixtures';
import { showToast } from '../../../utils/toast';
import { VotingScreen } from '../VotingScreen';

jest.mock('../../../api/proposals');
jest.mock('../../../hooks/useRefreshOnFocus', () => ({ useRefreshOnFocus: jest.fn() }));
jest.mock('../../../utils/toast', () => ({ showToast: jest.fn() }));
jest.mock('../../../utils/clock', () => ({ today: () => new Date(2026, 8, 29, 10, 0) }));

const mocked = proposalsApi as jest.Mocked<typeof proposalsApi>;
const route = { key: 'k', name: 'Voting', params: { proposalId: 'prop_2' } } as any;
const renderScreen = () => render(<VotingScreen navigation={{} as any} route={route} />);

beforeEach(() => jest.clearAllMocks());

it('muestra la propuesta, sus franjas y los recuentos (UI spec §2.7, con tildes)', async () => {
  mocked.getProposal.mockResolvedValue(makeProposal());
  await renderScreen();
  expect(await screen.findByText('Repaso antes de la entrega')).toBeTruthy();
  expect(screen.getByText('Google Meet')).toBeTruthy();
  expect(screen.getByText('Cierra: Mar 29 sep, 20:00')).toBeTruthy();
  expect(screen.getByText('En votación')).toBeTruthy();
  expect(screen.getByText('Elige una franja horaria')).toBeTruthy();
  expect(screen.getByText('Selecciona la opción que más te convenga. Un voto por persona.')).toBeTruthy();
  expect(screen.getByText('Mar · 16:00 - 18:00')).toBeTruthy();
  expect(screen.getByText('1 voto')).toBeTruthy();
  expect(screen.getAllByText('0 votos')).toHaveLength(2);
  expect(screen.getByText('50% del grupo disponible')).toBeTruthy();
});

it('votar una franja usa PUT; tocar la mía retira el voto con DELETE (G1, B8)', async () => {
  mocked.getProposal.mockResolvedValue(makeProposal());
  mocked.voteWindow.mockResolvedValue(
    makeProposal({
      myVoteWindowId: 'w_22',
      windows: [makeWindow({ voteCount: 1 }), makeWindow({ id: 'w_22', dayOfWeek: 4, startTime: '10:00', endTime: '12:00', voteCount: 1 })],
    }),
  );
  mocked.removeVote.mockResolvedValue(makeProposal());
  await renderScreen();

  await fireEvent.press(await screen.findByText('Jue · 10:00 - 12:00'));
  await waitFor(() => expect(showToast).toHaveBeenCalledWith('Tu voto ha sido registrado.'));
  expect(mocked.voteWindow).toHaveBeenCalledWith('prop_2', 'w_22');
  expect(screen.getByLabelText('Tu voto')).toBeTruthy();

  await fireEvent.press(screen.getByText('Jue · 10:00 - 12:00'));
  await waitFor(() => expect(showToast).toHaveBeenCalledWith('Tu voto se ha retirado.'));
  expect(mocked.removeVote).toHaveBeenCalledWith('prop_2');
  expect(screen.queryByLabelText('Tu voto')).toBeNull();
});

it('votación cerrada: aviso y sin votar ni agregar franjas (C1)', async () => {
  mocked.getProposal.mockResolvedValue(makeProposal({ votingDeadline: new Date(2026, 8, 29, 9, 0).toISOString() }));
  await renderScreen();
  expect(await screen.findByText('Cerró: Mar 29 sep, 09:00')).toBeTruthy();
  expect(screen.getByText('La votación está cerrada.')).toBeTruthy();
  await fireEvent.press(screen.getByText('Jue · 10:00 - 12:00'));
  expect(mocked.voteWindow).not.toHaveBeenCalled();
  expect(screen.queryByText('Agregar franja horaria')).toBeNull();
});

it('agregar franja: valida HH:mm y el orden (quirk 13) y la envía', async () => {
  mocked.getProposal.mockResolvedValue(makeProposal());
  mocked.addWindow.mockResolvedValue(
    makeProposal({
      windows: [...makeProposal().windows, makeWindow({ id: 'w_new', dayOfWeek: 5, startTime: '18:00', endTime: '19:30' })],
    }),
  );
  await renderScreen();
  await fireEvent.press(await screen.findByText('Agregar franja horaria'));
  expect(screen.getByText('Selecciona el día y la franja horaria que propones.')).toBeTruthy();

  await fireEvent.changeText(screen.getByLabelText('Hora de inicio (HH:mm)'), '9:00');
  expect(screen.getByText('Formato HH:mm')).toBeTruthy();
  // Guarda: enviar desde el teclado con una hora inválida no llama a la API.
  await fireEvent(screen.getByLabelText('Hora de fin (HH:mm)'), 'submitEditing');
  expect(mocked.addWindow).not.toHaveBeenCalled();

  await fireEvent.changeText(screen.getByLabelText('Hora de inicio (HH:mm)'), '18:00');
  await fireEvent.changeText(screen.getByLabelText('Hora de fin (HH:mm)'), '17:00');
  expect(screen.getByText('Debe ser posterior')).toBeTruthy();
  await fireEvent.changeText(screen.getByLabelText('Hora de fin (HH:mm)'), '19:30');
  await fireEvent.press(screen.getByText('Vie'));
  // Control positivo: con datos válidos, el mismo envío por teclado sí llama a la API.
  await fireEvent(screen.getByLabelText('Hora de fin (HH:mm)'), 'submitEditing');

  await waitFor(() => expect(showToast).toHaveBeenCalledWith('Franja horaria agregada.'));
  expect(mocked.addWindow).toHaveBeenCalledWith('prop_2', { dayOfWeek: 5, startTime: '18:00', endTime: '19:30' });
  expect(screen.getByText('Vie · 18:00 - 19:30')).toBeTruthy();
  expect(screen.queryByText('Selecciona el día y la franja horaria que propones.')).toBeNull();
});

it('si votar falla, muestra el error sin avisar de éxito', async () => {
  mocked.getProposal.mockResolvedValue(makeProposal());
  mocked.voteWindow.mockRejectedValue(new ApiError(409, 'VOTING_CLOSED', 'La votación ya cerró.'));
  await renderScreen();
  await fireEvent.press(await screen.findByText('Jue · 10:00 - 12:00'));
  expect(await screen.findByText('La votación ya cerró.')).toBeTruthy();
  expect(showToast).not.toHaveBeenCalled();
});
