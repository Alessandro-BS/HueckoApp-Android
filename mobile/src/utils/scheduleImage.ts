import * as ImagePicker from 'expo-image-picker';

import type { OcrImage } from '../api/ai';

// Mismas reglas que el servidor (POST /ai/schedule-ocr): se comprueban antes de subir nada.
export const OCR_IMAGE_TYPES: readonly string[] = ['image/jpeg', 'image/png', 'image/webp'];
export const OCR_MAX_BYTES = 5 * 1024 * 1024;

export const IMAGE_MESSAGES = {
  cameraDenied: 'Sin permiso de cámara. Actívalo en los ajustes del teléfono o elige una foto de la galería.',
  unsupported: 'Esa imagen no sirve: elige una foto JPG, PNG o WEBP.',
  tooLarge: 'La foto pesa más de 5 MB. Recórtala o elige otra.',
  failed: 'No se pudo abrir la cámara ni la galería. Inténtalo de nuevo.',
} as const;

export type ImageSource = 'camera' | 'gallery';

export type PickImageResult =
  | { kind: 'picked'; image: OcrImage }
  | { kind: 'canceled' }
  | { kind: 'error'; message: string; canOpenSettings: boolean };

const EXTENSION: Record<string, string> = { 'image/jpeg': 'jpg', 'image/png': 'png', 'image/webp': 'webp' };

/**
 * Foto del horario (tema del curso: cámara y permisos). La cámara pide permiso; la galería usa el selector del
 * sistema, que no lo necesita (D11). Nunca lanza.
 */
export async function pickScheduleImage(source: ImageSource): Promise<PickImageResult> {
  try {
    if (source === 'camera') {
      const { granted, canAskAgain } = await ImagePicker.requestCameraPermissionsAsync();
      if (!granted) return { kind: 'error', message: IMAGE_MESSAGES.cameraDenied, canOpenSettings: canAskAgain === false };
    }
    const options: ImagePicker.ImagePickerOptions = { mediaTypes: ['images'], quality: 0.7 };
    const result = source === 'camera' ? await ImagePicker.launchCameraAsync(options) : await ImagePicker.launchImageLibraryAsync(options);
    const asset = result.canceled ? undefined : result.assets[0];
    if (!asset) return { kind: 'canceled' };

    const mimeType = asset.mimeType ?? 'image/jpeg';
    if (!OCR_IMAGE_TYPES.includes(mimeType)) return { kind: 'error', message: IMAGE_MESSAGES.unsupported, canOpenSettings: false };
    if (asset.fileSize !== undefined && asset.fileSize > OCR_MAX_BYTES) {
      return { kind: 'error', message: IMAGE_MESSAGES.tooLarge, canOpenSettings: false };
    }
    return { kind: 'picked', image: { uri: asset.uri, mimeType, fileName: asset.fileName ?? `horario.${EXTENSION[mimeType]}` } };
  } catch {
    return { kind: 'error', message: IMAGE_MESSAGES.failed, canOpenSettings: false };
  }
}
