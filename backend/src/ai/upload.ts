import type { RequestHandler } from 'express';
import multer from 'multer';

import { ApiError } from '../middleware/errors';

export const OCR_IMAGE_TYPES: readonly string[] = ['image/jpeg', 'image/png', 'image/webp'];
const INVALID_IMAGE_MESSAGE = 'La imagen debe ser JPG, PNG o WEBP.';
export const OCR_MAX_BYTES = 5 * 1024 * 1024;

const startsWith = (buffer: Buffer, bytes: readonly number[], offset = 0) =>
  buffer.length >= offset + bytes.length && bytes.every((byte, i) => buffer[offset + i] === byte);

// Tipo real según los primeros bytes: JPEG, PNG o WEBP (RIFF….WEBP); null si no es ninguno.
export function detectImageType(buffer: Buffer): string | null {
  if (startsWith(buffer, [0xff, 0xd8, 0xff])) return 'image/jpeg';
  if (startsWith(buffer, [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])) return 'image/png';
  if (startsWith(buffer, [0x52, 0x49, 0x46, 0x46]) && startsWith(buffer, [0x57, 0x45, 0x42, 0x50], 8)) return 'image/webp';
  return null;
}

// La foto se queda en memoria (nunca se escribe en disco) y se reenvía a la IA tal cual.
const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: OCR_MAX_BYTES, files: 1 },
  fileFilter: (_req, file, cb) => {
    if (OCR_IMAGE_TYPES.includes(file.mimetype)) cb(null, true);
    else cb(new ApiError(400, 'INVALID_IMAGE', INVALID_IMAGE_MESSAGE));
  },
}).single('image');

// Traduce los errores de multer al formato del contrato.
export const uploadScheduleImage: RequestHandler = (req, res, next) => {
  upload(req, res, (error: unknown) => {
    if (error instanceof multer.MulterError) {
      if (error.code === 'LIMIT_FILE_SIZE') return next(new ApiError(413, 'PAYLOAD_TOO_LARGE', 'La imagen supera los 5 MB.'));
      return next(new ApiError(400, 'INVALID_UPLOAD', 'Envía una sola imagen en el campo «image».'));
    }
    if (error) return next(error);
    const file = req.file;
    // El tipo declarado lo escribe el cliente: se comprueba también con los primeros bytes del archivo.
    if (file && detectImageType(file.buffer) !== file.mimetype) {
      return next(new ApiError(400, 'INVALID_IMAGE', INVALID_IMAGE_MESSAGE));
    }
    next();
  });
};
