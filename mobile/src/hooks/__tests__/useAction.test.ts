import { act, renderHook } from '@testing-library/react-native';

import { ApiError } from '../../api/client';
import { useAction, type ActionResult } from '../useAction';

it('devuelve { ok: true, value } y marca loading mientras corre', async () => {
  let resolve!: (value: string) => void;
  const fn = jest.fn((_name: string) => new Promise<string>((r) => (resolve = r)));
  const { result } = await renderHook(() => useAction(fn));

  let pending!: Promise<ActionResult<string>>;
  await act(async () => {
    pending = result.current.run('Estudio');
  });
  expect(result.current.loading).toBe(true);
  expect(fn).toHaveBeenCalledWith('Estudio');

  await act(async () => resolve('hecho'));
  await expect(pending).resolves.toEqual({ ok: true, value: 'hecho' });
  expect(result.current.loading).toBe(false);
  expect(result.current.error).toBeNull();
});

it('si falla guarda el mensaje, devuelve { ok: false } y clearError lo borra', async () => {
  const fn = jest.fn<Promise<void>, []>().mockRejectedValue(new ApiError(409, 'ALREADY_MEMBER', 'Ya perteneces a este grupo.'));
  const { result } = await renderHook(() => useAction(fn));

  let res: ActionResult<void> | undefined;
  await act(async () => {
    res = await result.current.run();
  });
  expect(res).toEqual({ ok: false });
  expect(result.current.error).toBe('Ya perteneces a este grupo.');

  await act(async () => result.current.clearError());
  expect(result.current.error).toBeNull();
});

it('ignora un segundo envío mientras el primero sigue en curso', async () => {
  let resolve!: () => void;
  const fn = jest.fn(() => new Promise<void>((r) => (resolve = r)));
  const { result } = await renderHook(() => useAction(fn));

  let first!: Promise<ActionResult<void>>;
  let second!: Promise<ActionResult<void>>;
  await act(async () => {
    first = result.current.run();
    second = result.current.run();
  });
  await expect(second).resolves.toEqual({ ok: false });
  await act(async () => resolve());
  await expect(first).resolves.toEqual({ ok: true, value: undefined });
  expect(fn).toHaveBeenCalledTimes(1);
});
