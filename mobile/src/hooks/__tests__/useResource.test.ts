import { act, renderHook, waitFor } from '@testing-library/react-native';

import { ApiError } from '../../api/client';
import { useResource } from '../useResource';

function deferred<T>() {
  let resolve!: (value: T) => void;
  let reject!: (error: unknown) => void;
  const promise = new Promise<T>((res, rej) => {
    resolve = res;
    reject = rej;
  });
  return { promise, resolve, reject };
}

it('carga al montar: loading hasta que llegan los datos', async () => {
  const d = deferred<string[]>();
  const load = jest.fn(() => d.promise);
  const { result } = await renderHook(() => useResource(load));
  expect(result.current.loading).toBe(true);
  expect(result.current.data).toBeUndefined();

  await act(async () => d.resolve(['a']));
  expect(result.current.loading).toBe(false);
  expect(result.current.data).toEqual(['a']);
  expect(result.current.error).toBeNull();
  expect(load).toHaveBeenCalledTimes(1);
});

it('si falla deja el mensaje de error listo para mostrar', async () => {
  const load = jest.fn().mockRejectedValue(new ApiError(500, 'INTERNAL_ERROR', 'Error inesperado del servidor'));
  const { result } = await renderHook(() => useResource(load));
  await waitFor(() => expect(result.current.loading).toBe(false));
  expect(result.current.error).toBe('Error inesperado del servidor');
  expect(result.current.data).toBeUndefined();
});

it('reload con datos en pantalla usa refreshing (no loading) y limpia el error al acertar', async () => {
  const d = deferred<string[]>();
  const load = jest
    .fn<Promise<string[]>, []>()
    .mockResolvedValueOnce(['a'])
    .mockReturnValueOnce(d.promise);
  const { result } = await renderHook(() => useResource(load));
  await waitFor(() => expect(result.current.data).toEqual(['a']));

  let pending!: Promise<void>;
  await act(async () => {
    pending = result.current.reload();
  });
  expect(result.current.refreshing).toBe(true);
  expect(result.current.loading).toBe(false);
  expect(result.current.data).toEqual(['a']);

  await act(async () => {
    d.resolve(['b']);
    await pending;
  });
  expect(result.current.refreshing).toBe(false);
  expect(result.current.data).toEqual(['b']);
});

it('descarta una respuesta vieja que llega después de una más nueva', async () => {
  const first = deferred<string>();
  const second = deferred<string>();
  const load = jest.fn<Promise<string>, []>().mockReturnValueOnce(first.promise).mockReturnValueOnce(second.promise);
  const { result } = await renderHook(() => useResource(load));

  await act(async () => {
    void result.current.reload();
  });
  await act(async () => second.resolve('nuevo'));
  await act(async () => first.resolve('viejo'));
  expect(result.current.data).toBe('nuevo');
});

it('mutate cambia los datos sin ir al servidor', async () => {
  const load = jest.fn().mockResolvedValue([1, 2]);
  const { result } = await renderHook(() => useResource<number[]>(load));
  await waitFor(() => expect(result.current.data).toEqual([1, 2]));
  await act(async () => result.current.mutate((prev) => prev?.filter((n) => n !== 1)));
  expect(result.current.data).toEqual([2]);
  expect(load).toHaveBeenCalledTimes(1);
});

it('vuelve a cargar si cambia la función load', async () => {
  const loadA = jest.fn().mockResolvedValue('A');
  const loadB = jest.fn().mockResolvedValue('B');
  const { result, rerender } = await renderHook(({ load }: { load: () => Promise<string> }) => useResource(load), {
    initialProps: { load: loadA },
  });
  await waitFor(() => expect(result.current.data).toBe('A'));
  await rerender({ load: loadB });
  await waitFor(() => expect(result.current.data).toBe('B'));
});

it('al cambiar load descarta los datos anteriores y vuelve al estado de primera carga', async () => {
  const loadA = jest.fn().mockResolvedValue('X');
  const b = deferred<string>();
  const loadB = jest.fn(() => b.promise);
  const { result, rerender } = await renderHook(({ load }: { load: () => Promise<string> }) => useResource(load), {
    initialProps: { load: loadA },
  });
  await waitFor(() => expect(result.current.data).toBe('X'));

  await rerender({ load: loadB });
  expect(result.current.data).toBeUndefined();
  expect(result.current.loading).toBe(true);
  expect(result.current.refreshing).toBe(false);

  await act(async () => b.resolve('Y'));
  expect(result.current.data).toBe('Y');
  expect(result.current.loading).toBe(false);
  expect(result.current.refreshing).toBe(false);
});

it('mutate invalida una recarga en curso: la respuesta vieja no pisa el cambio local', async () => {
  const old = deferred<string>();
  const load = jest.fn<Promise<string>, []>().mockResolvedValueOnce('X').mockReturnValueOnce(old.promise);
  const { result } = await renderHook(() => useResource(load));
  await waitFor(() => expect(result.current.data).toBe('X'));

  let pending!: Promise<void>;
  await act(async () => {
    pending = result.current.reload();
  });
  expect(result.current.refreshing).toBe(true);

  await act(async () => result.current.mutate(() => 'Y'));
  expect(result.current.data).toBe('Y');
  expect(result.current.refreshing).toBe(false);

  await act(async () => {
    old.resolve('X_old');
    await pending;
  });
  expect(result.current.data).toBe('Y');
  expect(result.current.refreshing).toBe(false);
  expect(result.current.loading).toBe(false);
});

it('al cambiar load ignora la respuesta pendiente del load anterior', async () => {
  const a = deferred<string>();
  const b = deferred<string>();
  const loadA = jest.fn(() => a.promise);
  const loadB = jest.fn(() => b.promise);
  const { result, rerender } = await renderHook(({ load }: { load: () => Promise<string> }) => useResource(load), {
    initialProps: { load: loadA },
  });

  await rerender({ load: loadB });
  await act(async () => a.resolve('X'));
  expect(result.current.data).toBeUndefined();
  expect(result.current.loading).toBe(true);

  await act(async () => b.resolve('Y'));
  expect(result.current.data).toBe('Y');
  expect(result.current.loading).toBe(false);
});

it('un mutate del load anterior no se aplica al recurso nuevo', async () => {
  const loadA = jest.fn().mockResolvedValue('A');
  const loadB = jest.fn().mockResolvedValue('B');
  const { result, rerender } = await renderHook(({ load }: { load: () => Promise<string> }) => useResource(load), {
    initialProps: { load: loadA },
  });
  await waitFor(() => expect(result.current.data).toBe('A'));
  const mutateA = result.current.mutate;

  await rerender({ load: loadB });
  await waitFor(() => expect(result.current.data).toBe('B'));
  await act(async () => mutateA(() => 'A editado'));
  expect(result.current.data).toBe('B');
});

it('loaded pasa a true tras una carga correcta aunque venga vacía', async () => {
  const d = deferred<string[]>();
  const load = jest.fn(() => d.promise);
  const { result } = await renderHook(() => useResource(load));
  expect(result.current.loaded).toBe(false);
  await act(async () => d.resolve([]));
  expect(result.current.loaded).toBe(true);
});
