import * as FileSystem from 'expo-file-system';
import * as Print from 'expo-print';
import * as Sharing from 'expo-sharing';

import { makeReport } from '../../testing/adminFixtures';
import { reportCsv, reportHtml } from '../reportExport';
import { shareReportCsv, shareReportPdf } from '../shareReport';

const writes = () => (FileSystem as unknown as { __writes: Map<string, string> }).__writes;

beforeEach(() => jest.clearAllMocks());

it('PDF: imprime el HTML del informe en el teléfono y lo comparte como PDF', async () => {
  await shareReportPdf(makeReport());
  expect(Print.printToFileAsync).toHaveBeenCalledWith({ html: reportHtml(makeReport()) });
  expect(Sharing.shareAsync).toHaveBeenCalledWith('file:///cache/informe.pdf', {
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

it('sin compartir disponible: error con mensaje propio y no se comparte', async () => {
  jest.mocked(Sharing.isAvailableAsync).mockResolvedValueOnce(false);
  await expect(shareReportPdf(makeReport())).rejects.toMatchObject({
    code: 'SHARING_UNAVAILABLE', message: 'Este dispositivo no permite compartir archivos.',
  });
  expect(Sharing.shareAsync).not.toHaveBeenCalled();
  // Control positivo: con compartir disponible, sí.
  await shareReportPdf(makeReport());
  expect(Sharing.shareAsync).toHaveBeenCalledTimes(1);
});
