import { act, renderHook } from '@testing-library/react-native';
import { useLayoutEffect } from 'react';

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

it('usa la última fn aunque se llame justo después de un render con una fn nueva (en un efecto de layout)', async () => {
  const first = jest.fn(async () => 'primera');
  const second = jest.fn(async () => 'segunda');
  type Props = { fn: () => Promise<string>; call: boolean };
  let pending: Promise<ActionResult<string>> | undefined;
  const { rerender } = await renderHook(
    ({ fn, call }: Props) => {
      const { run } = useAction(fn);
      // Se llama en el mismo commit en que llega la fn nueva, antes de cualquier efecto pasivo.
      useLayoutEffect(() => {
        if (call) pending = run();
      }, [call, run]);
    },
    { initialProps: { fn: first, call: false } as Props },
  );

  await rerender({ fn: second, call: true });
  await expect(pending).resolves.toEqual({ ok: true, value: 'segunda' });
  expect(first).not.toHaveBeenCalled();
  expect(second).toHaveBeenCalledTimes(1);
});

it('un nuevo envío borra el error del anterior', async () => {
  let resolve!: () => void;
  const fn = jest
    .fn<Promise<void>, []>()
    .mockRejectedValueOnce(new ApiError(409, 'VOTING_CLOSED', 'La votación ya cerró.'))
    .mockImplementationOnce(() => new Promise<void>((r) => (resolve = r)));
  const { result } = await renderHook(() => useAction(fn));

  await act(async () => {
    await result.current.run();
  });
  expect(result.current.error).toBe('La votación ya cerró.');

  let pending!: Promise<ActionResult<void>>;
  await act(async () => {
    pending = result.current.run();
  });
  // Mientras el nuevo envío sigue en curso, el error anterior ya no se muestra.
  expect(result.current.error).toBeNull();
  await act(async () => resolve());
  await expect(pending).resolves.toEqual({ ok: true, value: undefined });
  expect(result.current.error).toBeNull();
});
