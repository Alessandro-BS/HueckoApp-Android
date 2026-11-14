import { act, renderHook } from '@testing-library/react-native';

import { ApiError } from '../../api/client';
import { useVoteToggle } from '../useVoteToggle';

const setup = (mine: string[] | string | null = null, multiple = false) => {
  const vote = jest.fn().mockResolvedValue(undefined);
  const unvote = jest.fn().mockResolvedValue(undefined);
  const list = mine === null ? [] : Array.isArray(mine) ? mine : [mine];
  const votesOf = jest.fn((): readonly string[] => list);
  const isMultiple = jest.fn(() => multiple);
  return { vote, unvote, votesOf, isMultiple };
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
  expect(deps.votesOf).toHaveBeenCalledWith('p9');
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

it('voto múltiple: votar otra franja la añade y tocar una votada quita solo esa', async () => {
  const deps = setup(['w_1', 'w_2'], true);
  const { result } = await renderHook(() => useVoteToggle(deps));
  let outcome;
  await act(async () => {
    outcome = await result.current.toggle('p1', 'w_3');
  });
  expect(outcome).toEqual({ ok: true, value: 'voted' });
  expect(deps.vote).toHaveBeenCalledWith('p1', 'w_3');
  await act(async () => {
    outcome = await result.current.toggle('p1', 'w_1');
  });
  expect(outcome).toEqual({ ok: true, value: 'unvoted' });
  expect(deps.unvote).toHaveBeenCalledWith('p1', 'w_1');
});

it('voto único: tocar otra franja mueve el voto y tocar la mía lo quita sin indicar franja', async () => {
  const deps = setup(['w_1'], false);
  const { result } = await renderHook(() => useVoteToggle(deps));
  await act(async () => void (await result.current.toggle('p1', 'w_2')));
  expect(deps.vote).toHaveBeenCalledWith('p1', 'w_2');
  await act(async () => void (await result.current.toggle('p1', 'w_1')));
  expect(deps.unvote).toHaveBeenCalledWith('p1');
});
