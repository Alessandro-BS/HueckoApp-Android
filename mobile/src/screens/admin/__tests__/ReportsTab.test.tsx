import { fireEvent, render, screen, waitFor, within } from '@testing-library/react-native';

import * as adminApi from '../../../api/admin';
import { ApiError } from '../../../api/client';
import { makeReport } from '../../../testing/adminFixtures';
import { shareReportCsv, shareReportPdf } from '../../../utils/shareReport';
import { ReportsTab } from '../tabs/ReportsTab';

jest.mock('../../../api/admin');
jest.mock('../../../utils/shareReport');
jest.mock('../../../utils/clock', () => ({ today: () => new Date(2026, 8, 29, 10, 0) }));
jest.mock('../../../utils/toast', () => ({ showToast: jest.fn() }));
const mocked = adminApi as jest.Mocked<typeof adminApi>;

beforeEach(() => {
  jest.clearAllMocks();
  mocked.getReport.mockResolvedValue(makeReport());
});

const pickDate = async (label: string, date: Date) => {
  await fireEvent.press(screen.getByLabelText(label));
  await fireEvent(screen.getByTestId('datetimepicker-date'), 'change', { type: 'set' }, date);
};

// El periodo viaja como días de calendario «YYYY-MM-DD», ambos incluidos (contrato de docs/api.md).
it('arranca con los últimos 30 días y muestra el informe del servidor', async () => {
  await render(<ReportsTab />);
  expect(await screen.findByText('Lun 31/08 – Mar 29/09')).toBeTruthy();
  expect(mocked.getReport).toHaveBeenCalledWith({ from: '2026-08-31', to: '2026-09-29' });
  expect(screen.getByLabelText('Usuarios nuevos: 3')).toBeTruthy();
  const registrations = within(screen.getByTestId('report-registrations')).getByTestId('chart-line');
  expect(registrations.props.data.map((p: { value: number }) => p.value)).toEqual([2, 1]);
  expect(screen.getByText('Registros por día')).toBeTruthy();
  expect(screen.getByText('Proyecto Integrador')).toBeTruthy();
});

it('«7 días» y «Este semestre» piden su periodo al momento', async () => {
  await render(<ReportsTab />);
  await screen.findByText('Lun 31/08 – Mar 29/09');
  await fireEvent.press(screen.getByText('7 días'));
  await waitFor(() => expect(mocked.getReport).toHaveBeenLastCalledWith({ from: '2026-09-23', to: '2026-09-29' }));
  await fireEvent.press(screen.getByText('Este semestre'));
  await waitFor(() => expect(mocked.getReport).toHaveBeenLastCalledWith({ from: '2026-07-01', to: '2026-09-29' }));
});

it('«Personalizado» espera a «Aplicar» y valida las fechas antes de pedir nada', async () => {
  await render(<ReportsTab />);
  await screen.findByText('Lun 31/08 – Mar 29/09');
  await fireEvent.press(screen.getByText('Personalizado'));
  await fireEvent.press(screen.getByText('Aplicar'));
  expect(screen.getByText('Elige la fecha de inicio y la de fin.')).toBeTruthy();

  await pickDate('Desde', new Date(2026, 8, 10));
  await pickDate('Hasta', new Date(2026, 8, 5));
  await fireEvent.press(screen.getByText('Aplicar'));
  expect(screen.getByText('La fecha de inicio no puede ser posterior a la de fin.')).toBeTruthy();
  expect(mocked.getReport).toHaveBeenCalledTimes(1);

  // Control positivo: con un fin posterior sí pide el informe (del 10 al 20, ambos incluidos).
  await pickDate('Hasta', new Date(2026, 8, 20));
  await fireEvent.press(screen.getByText('Aplicar'));
  await waitFor(() => expect(mocked.getReport).toHaveBeenLastCalledWith({ from: '2026-09-10', to: '2026-09-20' }));
  expect(screen.queryByText('La fecha de inicio no puede ser posterior a la de fin.')).toBeNull();
});

it('Exportar PDF y CSV usan el mismo informe que se ve; un fallo se muestra', async () => {
  jest.mocked(shareReportCsv).mockRejectedValueOnce(new ApiError(0, 'SHARING_UNAVAILABLE', 'Este dispositivo no permite compartir archivos.'));
  await render(<ReportsTab />);
  await fireEvent.press(await screen.findByText('Exportar PDF'));
  expect(shareReportPdf).toHaveBeenCalledWith(makeReport());
  await fireEvent.press(screen.getByText('Exportar CSV'));
  expect(shareReportCsv).toHaveBeenCalledWith(makeReport());
  expect(await screen.findByText('Este dispositivo no permite compartir archivos.')).toBeTruthy();
});
