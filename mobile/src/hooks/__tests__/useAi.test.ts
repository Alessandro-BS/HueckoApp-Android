import type { AiStatus, TimeBlockInput } from '@hueckoapp/shared';
import { act, renderHook, waitFor } from '@testing-library/react-native';

import * as aiApi from '../../api/ai';
import { ApiError } from '../../api/client';
import { makeDraft, makeSuggestion, makeSummary } from '../../testing/fixtures';
import { useAiStatus } from '../useAiStatus';
import { useAiSuggestions } from '../useAiSuggestions';
import { useProposalDraft } from '../useProposalDraft';
import { useScheduleOcr } from '../useScheduleOcr';
import { useVotingSummary } from '../useVotingSummary';

jest.mock('../../api/ai');
const mocked = aiApi as jest.Mocked<typeof aiApi>;

const IMAGE = { uri: 'file:///horario.jpg', mimeType: 'image/jpeg', fileName: 'horario.jpg' };
const BLOCK: TimeBlockInput = { label: 'Cálculo', type: 'CLASE', startTime: '08:00', endTime: '10:00', isRecurring: true, dayOfWeek: 1, date: null };
const UNAVAILABLE = new ApiError(503, 'AI_UNAVAILABLE', 'La IA no está disponible en este momento. Inténtalo en unos minutos.');

beforeEach(() => jest.resetAllMocks());

it('useScheduleOcr lee la foto al montar y «retry» lo vuelve a intentar', async () => {
  mocked.scanSchedule.mockRejectedValueOnce(UNAVAILABLE).mockResolvedValueOnce({ blocks: [BLOCK] });
  const { result } = await renderHook(() => useScheduleOcr(IMAGE));
  await waitFor(() => expect(result.current.error).toBe(UNAVAILABLE.message));
  expect(result.current.blocks).toBeUndefined();

  await act(async () => result.current.retry());
  expect(result.current.blocks).toEqual([BLOCK]);
  expect(result.current.error).toBeNull();
  expect(mocked.scanSchedule).toHaveBeenCalledTimes(2);
  expect(mocked.scanSchedule).toHaveBeenCalledWith(IMAGE);
});

it('useProposalDraft devuelve el borrador, o null con el mensaje del servidor', async () => {
  mocked.draftProposal.mockResolvedValueOnce(makeDraft()).mockRejectedValueOnce(UNAVAILABLE);
  const { result } = await renderHook(() => useProposalDraft('g1'));

  let draft: Awaited<ReturnType<typeof result.current.generate>> = null;
  await act(async () => {
    draft = await result.current.generate('Estudiar el martes');
  });
  expect(draft).toEqual(makeDraft());
  expect(mocked.draftProposal).toHaveBeenCalledWith('g1', 'Estudiar el martes');

  await act(async () => {
    draft = await result.current.generate('Otra vez');
  });
  expect(draft).toBeNull();
  expect(result.current.error).toBe(UNAVAILABLE.message);
  await act(async () => result.current.clearError());
  expect(result.current.error).toBeNull();
});

it('useAiSuggestions guarda las ideas y conserva las anteriores si un reintento falla', async () => {
  mocked.suggestPlans.mockResolvedValueOnce({ suggestions: [makeSuggestion()] }).mockRejectedValueOnce(UNAVAILABLE);
  const { result } = await renderHook(() => useAiSuggestions('g1'));
  expect(result.current.suggestions).toBeNull();

  await act(async () => {
    await result.current.fetch();
  });
  expect(result.current.suggestions).toEqual([makeSuggestion()]);
  expect(mocked.suggestPlans).toHaveBeenCalledWith('g1');

  await act(async () => {
    await result.current.fetch();
  });
  expect(result.current.error).toBe(UNAVAILABLE.message);
  expect(result.current.suggestions).toEqual([makeSuggestion()]);
});

it('useVotingSummary pide el resumen y lo reemplaza al actualizar', async () => {
  mocked.summarizeVoting
    .mockResolvedValueOnce(makeSummary())
    .mockResolvedValueOnce(makeSummary({ recommendation: 'REPROGRAMAR' }));
  const { result } = await renderHook(() => useVotingSummary('prop_2'));
  await act(async () => {
    await result.current.request();
  });
  expect(result.current.summary?.recommendation).toBe('CONFIRMAR');
  await act(async () => {
    await result.current.request();
  });
  expect(result.current.summary?.recommendation).toBe('REPROGRAMAR');
  expect(mocked.summarizeVoting).toHaveBeenCalledWith('prop_2');
});

it.each([
  [{ provider: 'mock' as const }, true],
  [{ provider: 'gemini' as const }, false],
])('useAiStatus: %j → demo = %s', async (status, demo) => {
  mocked.getAiStatus.mockResolvedValue(status);
  const { result } = await renderHook(() => useAiStatus());
  await waitFor(() => expect(mocked.getAiStatus).toHaveBeenCalled());
  await waitFor(() => expect(result.current.demo).toBe(demo));
});

it('useAiStatus: si falla la consulta no se muestra el aviso (ya resuelta)', async () => {
  let reject: (e: unknown) => void = () => {};
  mocked.getAiStatus.mockReturnValue(
    new Promise<AiStatus>((_, r) => {
      reject = r;
    }),
  );
  const { result } = await renderHook(() => useAiStatus());
  await waitFor(() => expect(mocked.getAiStatus).toHaveBeenCalled());
  await act(async () => reject(UNAVAILABLE));
  expect(result.current.demo).toBe(false);
});

it('useAiSuggestions y useVotingSummary olvidan lo del id anterior al cambiar de id (con control positivo)', async () => {
  mocked.suggestPlans.mockResolvedValue({ suggestions: [makeSuggestion()] });
  mocked.summarizeVoting.mockResolvedValue(makeSummary());
  const ideas = await renderHook(({ id }: { id: string }) => useAiSuggestions(id), { initialProps: { id: 'g1' } });
  const summary = await renderHook(({ id }: { id: string }) => useVotingSummary(id), { initialProps: { id: 'p1' } });
  await act(async () => {
    await ideas.result.current.fetch();
    await summary.result.current.request();
  });
  expect(ideas.result.current.suggestions).toEqual([makeSuggestion()]);
  expect(summary.result.current.summary).toEqual(makeSummary());

  await ideas.rerender({ id: 'g1' });
  await summary.rerender({ id: 'p1' });
  expect(ideas.result.current.suggestions).toEqual([makeSuggestion()]);
  expect(summary.result.current.summary).toEqual(makeSummary());

  mocked.suggestPlans.mockRejectedValueOnce(UNAVAILABLE);
  mocked.summarizeVoting.mockRejectedValueOnce(UNAVAILABLE);
  await act(async () => {
    await ideas.result.current.fetch();
    await summary.result.current.request();
  });
  expect(ideas.result.current.error).toBe(UNAVAILABLE.message);
  expect(summary.result.current.error).toBe(UNAVAILABLE.message);

  await ideas.rerender({ id: 'g2' });
  await summary.rerender({ id: 'p2' });
  expect(ideas.result.current.suggestions).toBeNull();
  expect(summary.result.current.summary).toBeNull();
  expect(ideas.result.current.error).toBeNull();
  expect(summary.result.current.error).toBeNull();
});
