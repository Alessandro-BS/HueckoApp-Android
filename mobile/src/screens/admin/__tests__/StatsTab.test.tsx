import { fireEvent, render, screen, within } from '@testing-library/react-native';

import * as adminApi from '../../../api/admin';
import { ApiError } from '../../../api/client';
import { makePopularHours, makeStats, makeTimeseries } from '../../../testing/adminFixtures';
import { StatsTab } from '../tabs/StatsTab';

jest.mock('../../../api/admin');
jest.mock('../../../utils/clock', () => ({ today: () => new Date(2026, 8, 29, 10, 0) }));
jest.mock('../../../utils/toast', () => ({ showToast: jest.fn() }));
const mocked = adminApi as jest.Mocked<typeof adminApi>;

const values = (id: string, kind: 'bar' | 'line' = 'bar') =>
  within(screen.getByTestId(id)).getByTestId(`chart-${kind}`).props.data.map((p: { value: number }) => p.value);

beforeEach(() => {
  jest.clearAllMocks();
  mocked.getAdminStats.mockResolvedValue(makeStats());
  mocked.getTimeseries.mockResolvedValue(makeTimeseries());
  mocked.getPopularHours.mockResolvedValue(makePopularHours());
});

it('muestra las cifras del servidor, los gráficos con sus datos y el uso de la IA', async () => {
  await render(<StatsTab />);
  expect(await screen.findByLabelText('Usuarios: 4')).toBeTruthy();
  expect(screen.getByLabelText('Suspendidas: 1')).toBeTruthy();
  expect(screen.getByLabelText('Planes confirmados: 1. Confirmados o re-coordinando')).toBeTruthy(); // todos, sin periodo
  expect(screen.getByLabelText('Llamadas a la IA: 4. Éxito: 75 %')).toBeTruthy();
  expect(values('chart-states')).toEqual([1, 1, 0, 1]);
  expect(values('chart-registrations', 'line')).toEqual([2, 1]);
  expect(values('chart-proposals')).toEqual([0, 2]);
  expect(values('chart-hours')).toHaveLength(24);
  expect(values('chart-hours')[11]).toBe(2);
  expect(screen.getByText('Leer horario de una foto')).toBeTruthy();
  expect(screen.getByText('3 · 67 % · 2,1 s')).toBeTruthy();
  expect(screen.getAllByText('0 · —')).toHaveLength(2); // ideas y resumen: sin llamadas, sin duración
});

it('sin planes confirmados, el gráfico de horas explica por qué está vacío', async () => {
  mocked.getPopularHours.mockResolvedValue(makePopularHours({}));
  await render(<StatsTab />);
  expect(await screen.findByText('Todavía no hay planes confirmados.')).toBeTruthy();
  expect(within(screen.getByTestId('chart-hours')).queryByTestId('chart-bar')).toBeNull();
  expect(within(screen.getByTestId('chart-states')).getByTestId('chart-bar')).toBeTruthy(); // control positivo
});

it('si la carga falla, muestra el error y Reintentar vuelve a pedir', async () => {
  mocked.getAdminStats.mockRejectedValueOnce(new ApiError(0, 'NETWORK_ERROR', 'No se pudo conectar con el servidor. Revisa tu conexión.'));
  await render(<StatsTab />);
  expect(await screen.findByText('No se pudo conectar con el servidor. Revisa tu conexión.')).toBeTruthy();
  await fireEvent.press(screen.getByText('Reintentar'));
  expect(await screen.findByLabelText('Usuarios: 4')).toBeTruthy();
});
