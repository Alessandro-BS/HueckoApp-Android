import { fireEvent, render, screen, waitFor } from '@testing-library/react-native';

import * as aiApi from '../../../api/ai';
import { ApiError } from '../../../api/client';
import { makeSummary } from '../../../testing/fixtures';
import { AI_DEMO_TEXT } from '../../../utils/ai';
import { VotingSummaryCard } from '../VotingSummaryCard';

jest.mock('../../../api/ai');
const mocked = aiApi as jest.Mocked<typeof aiApi>;

beforeEach(() => {
  jest.clearAllMocks();
  mocked.getAiStatus.mockResolvedValue({ provider: 'gemini' });
});

it('no llama a la IA hasta pulsar «Resumir votación»', async () => {
  await render(<VotingSummaryCard proposalId="prop_2" />);
  expect(screen.getByText('Resumen con Huecko IA')).toBeTruthy();
  expect(screen.getByText('Resume los votos y los imprevistos y te sugiere si confirmar, reprogramar o cancelar. No cambia nada del plan.')).toBeTruthy();
  expect(mocked.summarizeVoting).not.toHaveBeenCalled();
});

it('muestra el resumen, la sugerencia y su motivo; «Actualizar resumen» lo vuelve a pedir', async () => {
  mocked.summarizeVoting.mockResolvedValueOnce(makeSummary()).mockResolvedValueOnce(makeSummary({ recommendation: 'REPROGRAMAR', reason: 'Votos repartidos.' }));
  await render(<VotingSummaryCard proposalId="prop_2" />);
  await fireEvent.press(screen.getByText('Resumir votación'));

  expect(await screen.findByText('Votó 1 de 2 integrantes: el jueves va ganando y no hay imprevistos.')).toBeTruthy();
  expect(mocked.summarizeVoting).toHaveBeenCalledWith('prop_2');
  expect(screen.getByText('Sugerencia: Confirmar')).toBeTruthy();
  expect(screen.getByText('Hay una franja clara y nadie reportó problemas.')).toBeTruthy();
  expect(screen.getByText('Solo es una sugerencia: Huecko IA no cambia nada del plan.')).toBeTruthy();

  await fireEvent.press(screen.getByText('Actualizar resumen'));
  expect(await screen.findByText('Sugerencia: Reprogramar')).toBeTruthy();
  expect(screen.getByText('Votos repartidos.')).toBeTruthy();
  expect(mocked.summarizeVoting).toHaveBeenCalledTimes(2);
});

it('etiqueta en español cada recomendación', async () => {
  mocked.summarizeVoting.mockResolvedValue(makeSummary({ recommendation: 'CANCELAR' }));
  await render(<VotingSummaryCard proposalId="prop_2" />);
  await fireEvent.press(screen.getByText('Resumir votación'));
  expect(await screen.findByText('Sugerencia: Cancelar')).toBeTruthy();
});

it('si la IA falla muestra el motivo', async () => {
  mocked.summarizeVoting.mockRejectedValue(new ApiError(502, 'AI_BAD_RESPONSE', 'La IA respondió algo que no pudimos interpretar. Inténtalo de nuevo.'));
  await render(<VotingSummaryCard proposalId="prop_2" />);
  await fireEvent.press(screen.getByText('Resumir votación'));
  expect(await screen.findByText('La IA respondió algo que no pudimos interpretar. Inténtalo de nuevo.')).toBeTruthy();
  expect(screen.getByText('Resumir votación')).toBeTruthy();
});

it('en modo demostración lo avisa junto al resumen, y solo después de tenerlo', async () => {
  mocked.getAiStatus.mockResolvedValue({ provider: 'mock' });
  mocked.summarizeVoting.mockResolvedValue(makeSummary());
  await render(<VotingSummaryCard proposalId="prop_2" />);
  expect(screen.queryByText(AI_DEMO_TEXT)).toBeNull();
  await fireEvent.press(screen.getByText('Resumir votación'));
  await waitFor(() => expect(screen.getByText(AI_DEMO_TEXT)).toBeTruthy());
});

it('con Gemini real no muestra el aviso de demostración', async () => {
  mocked.summarizeVoting.mockResolvedValue(makeSummary());
  await render(<VotingSummaryCard proposalId="prop_2" />);
  await fireEvent.press(screen.getByText('Resumir votación'));
  expect(await screen.findByText('Sugerencia: Confirmar')).toBeTruthy();
  await waitFor(() => expect(mocked.getAiStatus).toHaveBeenCalled());
  expect(screen.queryByText(AI_DEMO_TEXT)).toBeNull();
});
