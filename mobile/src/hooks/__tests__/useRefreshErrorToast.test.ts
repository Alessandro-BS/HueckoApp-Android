import { renderHook } from '@testing-library/react-native';

import { showToast } from '../../utils/toast';
import { useRefreshErrorToast } from '../useRefreshErrorToast';

jest.mock('../../utils/toast', () => ({ showToast: jest.fn() }));

type Props = { error: string | null; hasData: boolean };

it('solo avisa si falla una recarga con datos en pantalla, una vez por error', async () => {
  const { rerender } = await renderHook(({ error, hasData }: Props) => useRefreshErrorToast(error, hasData), {
    initialProps: { error: null, hasData: false } as Props,
  });
  // Primera carga fallida: la muestra LoadState con «Reintentar», no un toast.
  await rerender({ error: 'Sin conexión', hasData: false });
  expect(showToast).not.toHaveBeenCalled();

  await rerender({ error: null, hasData: true });
  await rerender({ error: 'Sin conexión', hasData: true });
  expect(showToast).toHaveBeenCalledWith('Sin conexión');

  await rerender({ error: 'Sin conexión', hasData: true });
  expect(showToast).toHaveBeenCalledTimes(1);
});
