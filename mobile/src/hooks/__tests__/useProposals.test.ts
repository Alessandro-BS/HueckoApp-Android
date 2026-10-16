import { act, renderHook, waitFor } from '@testing-library/react-native';

import { ApiError } from '../../api/client';
import * as proposalsApi from '../../api/proposals';
import { makeConfirmed, makeProposal, makeWindow } from '../../testing/fixtures';
import { useProposal } from '../useProposal';
import { useProposals } from '../useProposals';

jest.mock('../../api/proposals');
const mocked = proposalsApi as jest.Mocked<typeof proposalsApi>;

beforeEach(() => jest.clearAllMocks());

describe('useProposals', () => {
  it('carga las propuestas del grupo y recarga si cambia el grupo', async () => {
    mocked.listGroupProposals.mockImplementation(async (groupId) => [makeProposal({ groupId })]);
    const { result, rerender } = await renderHook(({ id }: { id: string }) => useProposals(id), { initialProps: { id: 'g1' } });
    await waitFor(() => expect(result.current.proposals[0]?.groupId).toBe('g1'));
    await rerender({ id: 'g2' });
    await waitFor(() => expect(result.current.proposals[0]?.groupId).toBe('g2'));
    expect(mocked.listGroupProposals).toHaveBeenCalledWith('g2');
  });
});

describe('useProposal', () => {
  const load = async (initial = makeProposal()) => {
    mocked.getProposal.mockResolvedValue(initial);
    const hook = await renderHook(() => useProposal('prop_2'));
    await waitFor(() => expect(hook.result.current.proposal).toBeDefined());
    return hook;
  };

  it('toggleVote sobre otra franja vota con PUT y devuelve «voted»', async () => {
    const votada = makeProposal({ myVoteWindowId: 'w_22', windows: [makeWindow({ voteCount: 1 }), makeWindow({ id: 'w_22', dayOfWeek: 4, voteCount: 1 })] });
    mocked.voteWindow.mockResolvedValue(votada);
    const { result } = await load();
    let outcome;
    await act(async () => {
      outcome = await result.current.toggleVote('w_22');
    });
    expect(outcome).toEqual({ ok: true, value: 'voted' });
    expect(mocked.voteWindow).toHaveBeenCalledWith('prop_2', 'w_22');
    expect(result.current.proposal).toEqual(votada);
  });

  it('toggleVote sobre mi franja retira el voto con DELETE y devuelve «unvoted» (G1)', async () => {
    mocked.removeVote.mockResolvedValue(makeProposal());
    const { result } = await load(makeProposal({ myVoteWindowId: 'w_21' }));
    let outcome;
    await act(async () => {
      outcome = await result.current.toggleVote('w_21');
    });
    expect(outcome).toEqual({ ok: true, value: 'unvoted' });
    expect(mocked.removeVote).toHaveBeenCalledWith('prop_2');
    expect(mocked.voteWindow).not.toHaveBeenCalled();
    expect(result.current.proposal?.myVoteWindowId).toBeNull();
  });

  it('confirm, cancel, addWindow, reportIncidence y resolve reemplazan la propuesta con la respuesta', async () => {
    const confirmed = makeConfirmed({ id: 'prop_2' });
    mocked.confirmProposal.mockResolvedValue(confirmed);
    mocked.cancelProposal.mockResolvedValue(makeProposal({ state: 'CANCELADO' }));
    mocked.addWindow.mockResolvedValue(makeProposal({ title: 'Con franja nueva' }));
    mocked.reportIncidence.mockResolvedValue(makeProposal({ title: 'Con imprevisto' }));
    mocked.resolveIncidences.mockResolvedValue(makeProposal({ title: 'Resuelta' }));
    const { result } = await load();

    await act(async () => void (await result.current.confirm('w_22')));
    expect(mocked.confirmProposal).toHaveBeenCalledWith('prop_2', 'w_22');
    expect(result.current.proposal).toEqual(confirmed);

    await act(async () => void (await result.current.cancel()));
    expect(result.current.proposal?.state).toBe('CANCELADO');

    await act(async () => void (await result.current.addWindow({ dayOfWeek: 5, startTime: '18:00', endTime: '19:00' })));
    expect(mocked.addWindow).toHaveBeenCalledWith('prop_2', { dayOfWeek: 5, startTime: '18:00', endTime: '19:00' });
    expect(result.current.proposal?.title).toBe('Con franja nueva');

    await act(async () => void (await result.current.reportIncidence({ type: 'FALTA', reason: 'Enfermo' })));
    expect(result.current.proposal?.title).toBe('Con imprevisto');

    await act(async () => void (await result.current.resolve({ newState: 'CONFIRMADO' })));
    expect(mocked.resolveIncidences).toHaveBeenCalledWith('prop_2', { newState: 'CONFIRMADO' });
    expect(result.current.proposal?.title).toBe('Resuelta');
  });

  it('si el voto falla, no lanza: devuelve { ok: false }, expone voteError y la propuesta no cambia', async () => {
    mocked.voteWindow.mockRejectedValue(new ApiError(409, 'VOTING_CLOSED', 'La votación ya cerró.'));
    const { result } = await load();
    let outcome;
    await act(async () => {
      outcome = await result.current.toggleVote('w_22');
    });
    expect(outcome).toEqual({ ok: false });
    expect(result.current.voteError).toBe('La votación ya cerró.');
    expect(result.current.proposal).toEqual(makeProposal());
  });

  it('si otra acción falla, propaga el error y la propuesta no cambia', async () => {
    mocked.confirmProposal.mockRejectedValue(new ApiError(409, 'NOT_PROPOSED', 'Ya no se puede confirmar.'));
    const { result } = await load();
    await act(async () => {
      await expect(result.current.confirm()).rejects.toMatchObject({ code: 'NOT_PROPOSED' });
    });
    expect(result.current.proposal).toEqual(makeProposal());
  });
});
