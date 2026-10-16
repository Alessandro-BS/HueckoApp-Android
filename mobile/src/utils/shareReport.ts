import type { AdminReport } from '@hueckoapp/shared';
import { File, Paths } from 'expo-file-system';
import * as Print from 'expo-print';
import * as Sharing from 'expo-sharing';

import { ApiError } from '../api/client';
import { reportCsv, reportFileName, reportHtml } from './reportExport';

// ApiError con código propio (status 0) para que useAction muestre este mensaje (errorMessage solo lee ApiError).
const sharingUnavailable = () => new ApiError(0, 'SHARING_UNAVAILABLE', 'Este dispositivo no permite compartir archivos.');

// Se comprueba ANTES de generar nada: sin compartir disponible no se imprime ni se escribe ningún archivo.
async function assertCanShare() {
  if (!(await Sharing.isAvailableAsync())) throw sharingUnavailable();
}

const share = (uri: string, mimeType: string, UTI: string) =>
  Sharing.shareAsync(uri, { mimeType, UTI, dialogTitle: 'Compartir informe' });

/**
 * PDF generado en el teléfono a partir del HTML del informe (expo-print, D13) y compartido. expo-print lo guarda con
 * un nombre aleatorio en SU caché, que en Expo Go queda fuera de la carpeta de la app: moverlo falla («Missing 'READ'
 * permission»). Por eso se pide en base64 y se escribe en nuestra caché con el nombre del periodo (el mismo que el CSV),
 * sobrescribiendo uno anterior.
 */
export async function shareReportPdf(report: AdminReport): Promise<void> {
  await assertCanShare();
  const { base64 } = await Print.printToFileAsync({ html: reportHtml(report), base64: true });
  if (!base64) throw new Error('expo-print no devolvió el PDF en base64');
  const file = new File(Paths.cache, reportFileName(report, 'pdf'));
  file.create({ overwrite: true });
  file.write(base64, { encoding: 'base64' });
  await share(file.uri, 'application/pdf', 'com.adobe.pdf');
}

/** CSV escrito en la caché de la app (expo-file-system) y compartido. Si ya existía, se sobrescribe. */
export async function shareReportCsv(report: AdminReport): Promise<void> {
  await assertCanShare();
  const file = new File(Paths.cache, reportFileName(report, 'csv'));
  file.create({ overwrite: true });
  file.write(reportCsv(report));
  await share(file.uri, 'text/csv', 'public.comma-separated-values-text');
}
