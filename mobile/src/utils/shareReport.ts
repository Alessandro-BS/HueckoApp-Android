import type { AdminReport } from '@hueckoapp/shared';
import { File, Paths } from 'expo-file-system';
import * as Print from 'expo-print';
import * as Sharing from 'expo-sharing';

import { ApiError } from '../api/client';
import { reportCsv, reportFileName, reportHtml } from './reportExport';

// ApiError con código propio (status 0) para que useAction muestre este mensaje (errorMessage solo lee ApiError).
const sharingUnavailable = () => new ApiError(0, 'SHARING_UNAVAILABLE', 'Este dispositivo no permite compartir archivos.');

async function share(uri: string, mimeType: string, UTI: string) {
  if (!(await Sharing.isAvailableAsync())) throw sharingUnavailable();
  await Sharing.shareAsync(uri, { mimeType, UTI, dialogTitle: 'Compartir informe' });
}

/** PDF generado en el teléfono a partir del HTML del informe (expo-print) y compartido (D13). */
export async function shareReportPdf(report: AdminReport): Promise<void> {
  const { uri } = await Print.printToFileAsync({ html: reportHtml(report) });
  await share(uri, 'application/pdf', 'com.adobe.pdf');
}

/** CSV escrito en la caché de la app (expo-file-system) y compartido. Si ya existía, se sobrescribe. */
export async function shareReportCsv(report: AdminReport): Promise<void> {
  const file = new File(Paths.cache, reportFileName(report, 'csv'));
  file.create({ overwrite: true });
  file.write(reportCsv(report));
  await share(file.uri, 'text/csv', 'public.comma-separated-values-text');
}
