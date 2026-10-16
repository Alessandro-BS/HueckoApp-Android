import { File } from 'expo-file-system';
import { ImageManipulator, SaveFormat } from 'expo-image-manipulator';
import * as ImagePicker from 'expo-image-picker';

import type { OcrImage } from '../api/ai';

// Mismas reglas que el servidor (POST /ai/schedule-ocr): se comprueban antes de subir nada.
export const OCR_IMAGE_TYPES: readonly string[] = ['image/jpeg', 'image/png', 'image/webp'];
export const OCR_MAX_BYTES = 5 * 1024 * 1024;

// Las cámaras de muchos megapíxeles dan fotos de más de 5 MB aunque se compriman al 70 %. Para leer un horario
// sobran 2000 px de lado mayor: una foto más grande, o que pese más de 2 MB, se reduce y se guarda en JPEG.
export const OCR_MAX_SIDE = 2000;
const SHRINK_ABOVE_BYTES = 2 * 1024 * 1024;
const JPEG_QUALITY = 0.7;

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
const TYPE_BY_EXTENSION: Record<string, string> = { jpg: 'image/jpeg', jpeg: 'image/jpeg', png: 'image/png', webp: 'image/webp' };

// Las fotos del iPhone son HEIC y el servidor solo acepta JPG, PNG o WEBP: se piden ya convertidas (D11, verificado en
// expo-image-picker 57.0.20: ios/MediaHandler.swift, ios/ImageUtils.swift, android/.../MediaHandler.kt).
// - iOS, galería: «Compatible» hace que el sistema entregue la versión más compatible (JPEG) en vez del HEIC original
//   (con el modo por defecto se copia el .heic tal cual) y, con quality < 1, el módulo la recomprime a .jpg.
// - iOS, cámara: ya devuelve JPG.
// - Android: con quality < 1 recomprime a .jpeg, pero `mimeType` sigue diciendo el tipo del original (p. ej. image/heic);
//   por eso el tipo real sale primero de la extensión de `uri`, que es el archivo que se sube.
const PICKER_OPTIONS: ImagePicker.ImagePickerOptions = {
  mediaTypes: ['images'],
  quality: 0.7,
  preferredAssetRepresentationMode: ImagePicker.UIImagePickerPreferredAssetRepresentationMode.Compatible,
};

/** Tipo según la extensión de un nombre o una uri (sin «?…» ni «#…»); undefined si no tiene o no es JPG/PNG/WEBP. */
function typeOfName(name: string | null | undefined): string | undefined {
  const extension = name?.split(/[?#]/)[0].match(/\.([a-z0-9]+)$/i)?.[1].toLowerCase();
  return extension ? TYPE_BY_EXTENSION[extension] : undefined;
}

// Manda el archivo que de verdad se sube (su uri); después, lo que dijo el selector; después, el nombre; JPG si no hay pista.
const realType = (asset: ImagePicker.ImagePickerAsset): string =>
  typeOfName(asset.uri) ?? asset.mimeType ?? typeOfName(asset.fileName) ?? 'image/jpeg';

// El nombre original puede conservar la extensión de antes de convertir (IMG_0001.HEIC): si no cuadra con el tipo real,
// se sube como «horario.<ext>». Un nombre sin extensión se deja tal cual.
function uploadName(fileName: string | null | undefined, mimeType: string): string {
  if (!fileName) return `horario.${EXTENSION[mimeType]}`;
  const hasExtension = /\.[a-z0-9]+$/i.test(fileName);
  return hasExtension && typeOfName(fileName) !== mimeType ? `horario.${EXTENSION[mimeType]}` : fileName;
}

const needsShrink = (asset: ImagePicker.ImagePickerAsset) =>
  Math.max(asset.width, asset.height) > OCR_MAX_SIDE || (asset.fileSize ?? 0) > SHRINK_ABOVE_BYTES;

/** Limita el lado mayor a OCR_MAX_SIDE (sin agrandar) y guarda en JPEG. Devuelve la uri nueva y su peso real. */
async function shrink(asset: ImagePicker.ImagePickerAsset): Promise<{ uri: string; size: number }> {
  const context = ImageManipulator.manipulate(asset.uri);
  if (Math.max(asset.width, asset.height) > OCR_MAX_SIDE) {
    context.resize(asset.width >= asset.height ? { width: OCR_MAX_SIDE } : { height: OCR_MAX_SIDE });
  }
  const image = await context.renderAsync();
  const { uri } = await image.saveAsync({ compress: JPEG_QUALITY, format: SaveFormat.JPEG });
  return { uri, size: new File(uri).size };
}

/**
 * Foto del horario (tema del curso: cámara y permisos). La cámara pide permiso; la galería usa el selector del
 * sistema, que no lo necesita (D11 de la Fase 4). Nunca lanza.
 */
export async function pickScheduleImage(source: ImageSource): Promise<PickImageResult> {
  try {
    if (source === 'camera') {
      const { granted, canAskAgain } = await ImagePicker.requestCameraPermissionsAsync();
      if (!granted) return { kind: 'error', message: IMAGE_MESSAGES.cameraDenied, canOpenSettings: canAskAgain === false };
    }
    const result =
      source === 'camera' ? await ImagePicker.launchCameraAsync(PICKER_OPTIONS) : await ImagePicker.launchImageLibraryAsync(PICKER_OPTIONS);
    const asset = result.canceled ? undefined : result.assets[0];
    if (!asset) return { kind: 'canceled' };

    const mimeType = realType(asset);
    if (!OCR_IMAGE_TYPES.includes(mimeType)) return { kind: 'error', message: IMAGE_MESSAGES.unsupported, canOpenSettings: false };
    if (needsShrink(asset)) {
      const small = await shrink(asset);
      if (small.size > OCR_MAX_BYTES) return { kind: 'error', message: IMAGE_MESSAGES.tooLarge, canOpenSettings: false };
      return { kind: 'picked', image: { uri: small.uri, mimeType: 'image/jpeg', fileName: uploadName(asset.fileName, 'image/jpeg') } };
    }
    return { kind: 'picked', image: { uri: asset.uri, mimeType, fileName: uploadName(asset.fileName, mimeType) } };
  } catch {
    return { kind: 'error', message: IMAGE_MESSAGES.failed, canOpenSettings: false };
  }
}
