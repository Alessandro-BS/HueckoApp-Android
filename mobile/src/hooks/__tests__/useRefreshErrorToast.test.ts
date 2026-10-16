import { renderHook } from '@testing-library/react-native';

import { showToast } from '../../utils/toast';
import { useRefreshErrorToast } from '../useRefreshErrorToast';

jest.mock('../../utils/toast', () => ({ showToast: jest.fn() }));

beforeEach(() => jest.mocked(showToast).mockClear());

type Props = { error: string | null; hasData: boolean; failedLoads: number };

const setup = (initialProps: Props) =>
  renderHook(({ error, hasData, failedLoads }: Props) => useRefreshErrorToast(error, hasData, failedLoads), { initialProps });

it('solo avisa si falla una recarga con datos en pantalla, una vez por fallo', async () => {
  const { rerender } = await setup({ error: null, hasData: false, failedLoads: 0 });
  // Primera carga fallida: la muestra LoadState con «Reintentar», no un toast.
  await rerender({ error: 'Sin conexión', hasData: false, failedLoads: 1 });
  expect(showToast).not.toHaveBeenCalled();

  await rerender({ error: null, hasData: true, failedLoads: 1 });
  await rerender({ error: 'Sin conexión', hasData: true, failedLoads: 2 });
  expect(showToast).toHaveBeenCalledWith('Sin conexión');

  // Otro render sin un fallo nuevo no repite el aviso.
  await rerender({ error: 'Sin conexión', hasData: true, failedLoads: 2 });
  expect(showToast).toHaveBeenCalledTimes(1);
});

it('dos recargas seguidas que fallan con el mismo mensaje avisan dos veces', async () => {
  const { rerender } = await setup({ error: null, hasData: true, failedLoads: 0 });
  await rerender({ error: 'Sin conexión', hasData: true, failedLoads: 1 });
  await rerender({ error: 'Sin conexión', hasData: true, failedLoads: 2 });
  expect(showToast).toHaveBeenCalledTimes(2);
  expect(showToast).toHaveBeenNthCalledWith(2, 'Sin conexión');
});
