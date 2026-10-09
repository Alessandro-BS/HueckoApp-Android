import { act, fireEvent, render, screen, waitFor, within } from '@testing-library/react-native';

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
  await fireEvent(screen.getByTestId('datetimepicker-date'), 'valueChange', { nativeEvent: {} }, date);
};

// El periodo viaja como días de calendario «YYYY-MM-DD», ambos incluidos (contrato de docs/api.md).
it('arranca con los últimos 30 días y muestra el informe del servidor', async () => {
  await render(<ReportsTab />);
  expect(await screen.findByText('Lun 31/08 – Mar 29/09')).toBeTruthy();
  expect(mocked.getReport).toHaveBeenCalledWith({ from: '2026-08-31', to: '2026-09-29' });
  expect(screen.getByLabelText('Usuarios nuevos: 3')).toBeTruthy();
  // M2: lo que cuenta es la fecha del plan, no cuándo se confirmó; se dice en la etiqueta y en la pista.
  expect(screen.getByLabelText(`Planes con fecha en el periodo: ${makeReport().summary.confirmedPlans}. Confirmados o re-coordinando`)).toBeTruthy();
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

it('Exportar PDF y CSV usan exactamente el informe que se ve (el mismo objeto); un fallo se muestra', async () => {
  const shown = makeReport();
  mocked.getReport.mockResolvedValueOnce(shown);
  jest.mocked(shareReportCsv).mockRejectedValueOnce(new ApiError(0, 'SHARING_UNAVAILABLE', 'Este dispositivo no permite compartir archivos.'));
  await render(<ReportsTab />);
  await fireEvent.press(await screen.findByText('Exportar PDF'));
  expect(jest.mocked(shareReportPdf).mock.calls[0][0]).toBe(shown);
  await fireEvent.press(screen.getByText('Exportar CSV'));
  expect(jest.mocked(shareReportCsv).mock.calls[0][0]).toBe(shown);
  expect(await screen.findByText('Este dispositivo no permite compartir archivos.')).toBeTruthy();
  expect(mocked.getReport).toHaveBeenCalledTimes(1); // no se volvió a pedir el informe para exportar
});

describe('el error de exportación es siempre el de la última exportación', () => {
  const PDF_FAILED = 'No se pudo generar el PDF.';
  const CSV_FAILED = 'Este dispositivo no permite compartir archivos.';

  it('dos fallos seguidos muestran solo el segundo; un éxito después lo borra', async () => {
    jest.mocked(shareReportPdf).mockRejectedValueOnce(new ApiError(0, 'PRINT_FAILED', PDF_FAILED));
    jest.mocked(shareReportCsv).mockRejectedValueOnce(new ApiError(0, 'SHARING_UNAVAILABLE', CSV_FAILED));
    await render(<ReportsTab />);
    await fireEvent.press(await screen.findByText('Exportar PDF'));
    expect(await screen.findByText(PDF_FAILED)).toBeTruthy();
    await fireEvent.press(screen.getByText('Exportar CSV'));
    expect(await screen.findByText(CSV_FAILED)).toBeTruthy();
    expect(screen.queryByText(PDF_FAILED)).toBeNull(); // no se queda el del PDF

    await fireEvent.press(screen.getByText('Exportar PDF')); // ahora sale bien
    await waitFor(() => expect(shareReportPdf).toHaveBeenCalledTimes(2));
    expect(screen.queryByText(CSV_FAILED)).toBeNull();
    expect(screen.queryByText(PDF_FAILED)).toBeNull();
  });

  it('un fallo y después un éxito de la otra exportación: no queda ningún error', async () => {
    jest.mocked(shareReportCsv).mockRejectedValueOnce(new ApiError(0, 'SHARING_UNAVAILABLE', CSV_FAILED));
    await render(<ReportsTab />);
    await fireEvent.press(await screen.findByText('Exportar CSV'));
    expect(await screen.findByText(CSV_FAILED)).toBeTruthy();
    await fireEvent.press(screen.getByText('Exportar PDF'));
    await waitFor(() => expect(shareReportPdf).toHaveBeenCalledTimes(1));
    expect(screen.queryByText(CSV_FAILED)).toBeNull();
  });

  it('cambiar el periodo borra el error de una exportación anterior', async () => {
    jest.mocked(shareReportPdf).mockRejectedValueOnce(new ApiError(0, 'PRINT_FAILED', PDF_FAILED));
    await render(<ReportsTab />);
    await fireEvent.press(await screen.findByText('Exportar PDF'));
    expect(await screen.findByText(PDF_FAILED)).toBeTruthy();
    await fireEvent.press(screen.getByText('7 días'));
    await waitFor(() => expect(mocked.getReport).toHaveBeenCalledTimes(2));
    await screen.findByText('Exportar PDF');
    expect(screen.queryByText(PDF_FAILED)).toBeNull();
  });
});

it('mientras se exporta, ninguno de los dos botones se puede pulsar', async () => {
  let finish: () => void = () => {};
  jest.mocked(shareReportCsv).mockImplementationOnce(() => new Promise<void>((resolve) => (finish = resolve)));
  await render(<ReportsTab />);
  await fireEvent.press(await screen.findByText('Exportar CSV'));
  const csvButton = screen.getByRole('button', { name: /Exportar CSV/ });
  const pdfButton = screen.getByRole('button', { name: /Exportar PDF/ });
  expect(csvButton).toBeDisabled();
  expect(csvButton.props.accessibilityState).toMatchObject({ busy: true });
  expect(pdfButton).toBeDisabled();
  await fireEvent.press(screen.getByText('Exportar PDF'));
  expect(shareReportPdf).not.toHaveBeenCalled();
  await act(async () => finish());
  // Control positivo: al terminar, los dos vuelven a funcionar.
  expect(screen.getByRole('button', { name: /Exportar PDF/ })).toBeEnabled();
  await fireEvent.press(screen.getByText('Exportar PDF'));
  expect(shareReportPdf).toHaveBeenCalledTimes(1);
});
