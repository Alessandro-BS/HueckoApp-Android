import * as FileSystem from 'expo-file-system';
import * as Print from 'expo-print';
import * as Sharing from 'expo-sharing';

import { makeReport } from '../../testing/adminFixtures';
import { reportCsv, reportHtml } from '../reportExport';
import { shareReportCsv, shareReportPdf } from '../shareReport';

const writes = () => (FileSystem as unknown as { __writes: Map<string, string> }).__writes;

beforeEach(() => {
  jest.clearAllMocks();
  writes().clear();
});

it('PDF: imprime el HTML del informe, lo renombra con el periodo y lo comparte como PDF', async () => {
  await shareReportPdf(makeReport());
  expect(Print.printToFileAsync).toHaveBeenCalledWith({ html: reportHtml(makeReport()) });
  expect(Sharing.shareAsync).toHaveBeenCalledWith('file:///cache/informe-hueckoapp_2026-08-31_2026-09-29.pdf', {
    mimeType: 'application/pdf', UTI: 'com.adobe.pdf', dialogTitle: 'Compartir informe',
  });
});

it('CSV: lo escribe en la caché y lo comparte como text/csv', async () => {
  await shareReportCsv(makeReport());
  const uri = 'file:///cache/informe-hueckoapp_2026-08-31_2026-09-29.csv';
  expect(writes().get(uri)).toBe(reportCsv(makeReport()));
  expect(Sharing.shareAsync).toHaveBeenCalledWith(uri, {
    mimeType: 'text/csv', UTI: 'public.comma-separated-values-text', dialogTitle: 'Compartir informe',
  });
});

it('CSV: exportar otra vez el mismo periodo sobrescribe el archivo anterior', async () => {
  const uri = 'file:///cache/informe-hueckoapp_2026-08-31_2026-09-29.csv';
  writes().set(uri, 'contenido viejo');
  const newer = makeReport({ topGroups: [{ id: 'g2', name: 'Fútbol', proposals: 5 }] });
  await shareReportCsv(newer);
  expect(writes().get(uri)).toBe(reportCsv(newer));
  expect(Sharing.shareAsync).toHaveBeenCalledTimes(1);
});

it('sin compartir disponible: error con mensaje propio y no se genera ni se escribe nada', async () => {
  jest.mocked(Sharing.isAvailableAsync).mockResolvedValueOnce(false).mockResolvedValueOnce(false);
  const unavailable = { code: 'SHARING_UNAVAILABLE', message: 'Este dispositivo no permite compartir archivos.' };
  await expect(shareReportPdf(makeReport())).rejects.toMatchObject(unavailable);
  await expect(shareReportCsv(makeReport())).rejects.toMatchObject(unavailable);
  expect(Print.printToFileAsync).not.toHaveBeenCalled();
  expect(writes().size).toBe(0);
  expect(Sharing.shareAsync).not.toHaveBeenCalled();
  // Control positivo: con compartir disponible, sí.
  await shareReportPdf(makeReport());
  expect(Print.printToFileAsync).toHaveBeenCalledTimes(1);
  expect(Sharing.shareAsync).toHaveBeenCalledTimes(1);
});
