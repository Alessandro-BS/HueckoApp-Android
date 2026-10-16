import { act, renderHook } from '@testing-library/react-native';

import { ApiError } from '../../api/client';
import { useVoteToggle } from '../useVoteToggle';

const setup = (mine: string | null = null) => {
  const vote = jest.fn().mockResolvedValue(undefined);
  const unvote = jest.fn().mockResolvedValue(undefined);
  const currentVote = jest.fn(() => mine);
  return { vote, unvote, currentVote };
};

it('vota si la franja no es la mía y avisa «voted»', async () => {
  const deps = setup('w_1');
  const { result } = await renderHook(() => useVoteToggle(deps));
  let outcome;
  await act(async () => {
    outcome = await result.current.toggle('p1', 'w_2');
  });
  expect(outcome).toEqual({ ok: true, value: 'voted' });
  expect(deps.vote).toHaveBeenCalledWith('p1', 'w_2');
  expect(deps.unvote).not.toHaveBeenCalled();
});

it('retira el voto si toco la franja que ya voté (G1) y avisa «unvoted»', async () => {
  const deps = setup('w_1');
  const { result } = await renderHook(() => useVoteToggle(deps));
  let outcome;
  await act(async () => {
    outcome = await result.current.toggle('p1', 'w_1');
  });
  expect(outcome).toEqual({ ok: true, value: 'unvoted' });
  expect(deps.unvote).toHaveBeenCalledWith('p1');
  expect(deps.vote).not.toHaveBeenCalled();
});

it('consulta el voto actual de la propuesta tocada (sirve para varias propuestas)', async () => {
  const deps = setup(null);
  const { result } = await renderHook(() => useVoteToggle(deps));
  await act(async () => void (await result.current.toggle('p9', 'w_3')));
  expect(deps.currentVote).toHaveBeenCalledWith('p9');
});

it('si falla no lanza: devuelve { ok: false } y expone el mensaje; clearError lo limpia', async () => {
  const deps = setup();
  deps.vote.mockRejectedValue(new ApiError(409, 'VOTING_CLOSED', 'La votación ya cerró.'));
  const { result } = await renderHook(() => useVoteToggle(deps));
  let outcome;
  await act(async () => {
    outcome = await result.current.toggle('p1', 'w_2');
  });
  expect(outcome).toEqual({ ok: false });
  expect(result.current.error).toBe('La votación ya cerró.');
  await act(async () => result.current.clearError());
  expect(result.current.error).toBeNull();
});

it('evita el doble toque mientras hay un voto en curso', async () => {
  const deps = setup();
  let release: () => void = () => {};
  deps.vote.mockReturnValue(new Promise<void>((resolve) => (release = resolve)));
  const { result } = await renderHook(() => useVoteToggle(deps));
  let first!: Promise<unknown>;
  let second: unknown;
  await act(async () => {
    first = result.current.toggle('p1', 'w_2');
    second = await result.current.toggle('p1', 'w_2');
  });
  expect(second).toEqual({ ok: false });
  await act(async () => {
    release();
    await first;
  });
  expect(deps.vote).toHaveBeenCalledTimes(1);
});
