import * as ImagePicker from 'expo-image-picker';

import { IMAGE_MESSAGES, OCR_MAX_SIDE, pickScheduleImage } from '../scheduleImage';

// Reducción de fotos grandes: el contexto de expo-image-manipulator encadena resize → renderAsync → saveAsync.
const mockResize = jest.fn();
const mockSave = jest.fn();
const mockManipulate = jest.fn();
jest.mock('expo-image-manipulator', () => ({
  SaveFormat: { JPEG: 'jpeg' },
  ImageManipulator: { manipulate: (uri: string) => mockManipulate(uri) },
}));
// Tamaño real del archivo ya reducido.
const mockFileSize = jest.fn();
jest.mock('expo-file-system', () => ({ File: jest.fn().mockImplementation(() => ({ get size() { return mockFileSize(); } })) }));

const picker = jest.mocked(ImagePicker);
const asset = (over: Record<string, unknown> = {}) => ({
  uri: 'file:///horario.jpg', mimeType: 'image/jpeg', fileName: 'horario.jpg', fileSize: 1_000_000, width: 1200, height: 900, ...over,
});
const picked = (over: Record<string, unknown> = {}) => ({ canceled: false, assets: [asset(over)] }) as any;
const OPTIONS = {
  mediaTypes: ['images'], quality: 0.7,
  preferredAssetRepresentationMode: ImagePicker.UIImagePickerPreferredAssetRepresentationMode.Compatible,
};

beforeEach(() => {
  jest.clearAllMocks();
  const context = { resize: mockResize, renderAsync: jest.fn(async () => ({ saveAsync: mockSave })) };
  mockResize.mockReturnValue(context);
  mockManipulate.mockReturnValue(context);
  mockSave.mockResolvedValue({ uri: 'file:///cache/reducida.jpg', width: 2000, height: 1500 });
  mockFileSize.mockReturnValue(800_000);
});

it('galería: sin pedir permiso (selector del sistema), solo imágenes, comprimidas y en JPEG si eran HEIC', async () => {
  picker.launchImageLibraryAsync.mockResolvedValue(picked());
  await expect(pickScheduleImage('gallery')).resolves.toEqual({
    kind: 'picked', image: { uri: 'file:///horario.jpg', mimeType: 'image/jpeg', fileName: 'horario.jpg' },
  });
  expect(picker.requestCameraPermissionsAsync).not.toHaveBeenCalled();
  expect(picker.launchImageLibraryAsync).toHaveBeenCalledWith(OPTIONS);
});

it('cámara: pide permiso y abre la cámara', async () => {
  picker.requestCameraPermissionsAsync.mockResolvedValue({ granted: true, canAskAgain: true } as any);
  picker.launchCameraAsync.mockResolvedValue(picked({ mimeType: 'image/png', fileName: null, uri: 'file:///foto.png' }));
  await expect(pickScheduleImage('camera')).resolves.toEqual({
    kind: 'picked', image: { uri: 'file:///foto.png', mimeType: 'image/png', fileName: 'horario.png' },
  });
  expect(picker.launchCameraAsync).toHaveBeenCalledWith(OPTIONS);
});

it.each([
  [true, false],
  [false, true],
])('cámara sin permiso (canAskAgain=%s) → error; «Abrir ajustes» solo si ya no se puede volver a pedir', async (canAskAgain, canOpenSettings) => {
  picker.requestCameraPermissionsAsync.mockResolvedValue({ granted: false, canAskAgain } as any);
  await expect(pickScheduleImage('camera')).resolves.toEqual({ kind: 'error', message: IMAGE_MESSAGES.cameraDenied, canOpenSettings });
  expect(picker.launchCameraAsync).not.toHaveBeenCalled();
});

it('cancelar el selector no es un error', async () => {
  picker.launchImageLibraryAsync.mockResolvedValue({ canceled: true, assets: null } as any);
  await expect(pickScheduleImage('gallery')).resolves.toEqual({ kind: 'canceled' });
});

it('rechaza antes de subir una foto que el sistema no pudo convertir (sigue siendo .heic)', async () => {
  picker.launchImageLibraryAsync.mockResolvedValue(picked({ mimeType: 'image/heic', fileName: 'IMG_0001.HEIC', uri: 'file:///cache/IMG_0001.heic' }));
  await expect(pickScheduleImage('gallery')).resolves.toEqual({ kind: 'error', message: IMAGE_MESSAGES.unsupported, canOpenSettings: false });
  expect(mockManipulate).not.toHaveBeenCalled();
});

it('una foto normal (lado ≤ 2000 px y ≤ 2 MB) se sube tal cual, sin reducir', async () => {
  picker.launchImageLibraryAsync.mockResolvedValue(picked({ width: 2000, height: 1500, fileSize: 2 * 1024 * 1024 }));
  await expect(pickScheduleImage('gallery')).resolves.toMatchObject({ kind: 'picked', image: { uri: 'file:///horario.jpg' } });
  expect(mockManipulate).not.toHaveBeenCalled();
});

it.each([
  ['una foto de 108 MP de la cámara (más de 5 MB)', { width: 12000, height: 9000, fileSize: 9 * 1024 * 1024 }, { width: OCR_MAX_SIDE }],
  ['vertical: se limita la altura', { width: 3000, height: 4000, fileSize: 3 * 1024 * 1024 }, { height: OCR_MAX_SIDE }],
])('%s → se reduce a 2000 px de lado mayor, en JPEG, antes de subir', async (_caso, over, size) => {
  picker.requestCameraPermissionsAsync.mockResolvedValue({ granted: true, canAskAgain: true } as any);
  picker.launchCameraAsync.mockResolvedValue(picked({ uri: 'file:///cache/grande.jpg', fileName: 'IMG_1.jpg', ...over }));
  await expect(pickScheduleImage('camera')).resolves.toEqual({
    kind: 'picked', image: { uri: 'file:///cache/reducida.jpg', mimeType: 'image/jpeg', fileName: 'IMG_1.jpg' },
  });
  expect(mockManipulate).toHaveBeenCalledWith('file:///cache/grande.jpg');
  expect(mockResize).toHaveBeenCalledWith(size);
  expect(mockSave).toHaveBeenCalledWith({ compress: 0.7, format: 'jpeg' });
});

it('pesada pero ya pequeña de tamaño (p. ej. PNG): se vuelve a guardar en JPEG sin cambiar el tamaño', async () => {
  picker.launchImageLibraryAsync.mockResolvedValue(picked({ uri: 'file:///cache/captura.png', mimeType: 'image/png', fileName: 'captura.png', width: 1080, height: 1920, fileSize: 6 * 1024 * 1024 }));
  await expect(pickScheduleImage('gallery')).resolves.toEqual({
    kind: 'picked', image: { uri: 'file:///cache/reducida.jpg', mimeType: 'image/jpeg', fileName: 'horario.jpg' },
  });
  expect(mockResize).not.toHaveBeenCalled();
  expect(mockSave).toHaveBeenCalledWith({ compress: 0.7, format: 'jpeg' });
});

it('si aun reducida pasa de 5 MB, se avisa antes de subir', async () => {
  picker.launchImageLibraryAsync.mockResolvedValue(picked({ width: 8000, height: 6000, fileSize: 20 * 1024 * 1024 }));
  mockFileSize.mockReturnValue(5 * 1024 * 1024 + 1);
  await expect(pickScheduleImage('gallery')).resolves.toEqual({ kind: 'error', message: IMAGE_MESSAGES.tooLarge, canOpenSettings: false });
});

it('sin mimeType se asume JPG; si algo lanza, error genérico', async () => {
  picker.launchImageLibraryAsync.mockResolvedValueOnce(picked({ mimeType: undefined, fileName: undefined }));
  await expect(pickScheduleImage('gallery')).resolves.toMatchObject({ kind: 'picked', image: { mimeType: 'image/jpeg', fileName: 'horario.jpg' } });
  picker.launchImageLibraryAsync.mockRejectedValueOnce(new Error('sin actividad'));
  await expect(pickScheduleImage('gallery')).resolves.toEqual({ kind: 'error', message: IMAGE_MESSAGES.failed, canOpenSettings: false });
});

it.each([
  [{ fileName: 'Foto.PNG', uri: 'file:///cache/abc' }, 'image/png', 'Foto.PNG'],
  [{ fileName: null, uri: 'file:///cache/captura.webp' }, 'image/webp', 'horario.webp'],
  [{ fileName: 'scan.jpeg', uri: 'content://media/42' }, 'image/jpeg', 'scan.jpeg'],
  [{ fileName: null, uri: 'file:///cache/foto.png?v=2' }, 'image/png', 'horario.png'],
  [{ fileName: 'sin-extension', uri: 'content://media/43' }, 'image/jpeg', 'sin-extension'],
])('sin mimeType deduce el tipo por la extensión de fileName o uri: %j → %s', async (over, mimeType, fileName) => {
  picker.launchImageLibraryAsync.mockResolvedValue(picked({ mimeType: undefined, ...over }));
  await expect(pickScheduleImage('gallery')).resolves.toMatchObject({ kind: 'picked', image: { mimeType, fileName } });
});

it('sin fileSize (el sistema no lo informó) la foto se acepta', async () => {
  picker.launchImageLibraryAsync.mockResolvedValue(picked({ fileSize: undefined }));
  await expect(pickScheduleImage('gallery')).resolves.toEqual({
    kind: 'picked', image: { uri: 'file:///horario.jpg', mimeType: 'image/jpeg', fileName: 'horario.jpg' },
  });
});

it.each([
  ['Android: recomprimida a .jpeg aunque mimeType diga heic', { mimeType: 'image/heic', fileName: 'IMG_0001.HEIC', uri: 'file:///data/cache/ImagePicker/1b2c.jpeg' }],
  ['iOS: la galería la entrega en JPG con el nombre original', { mimeType: 'image/jpeg', fileName: 'IMG_0001.HEIC', uri: 'file:///tmp/ImagePicker/abc.jpg' }],
])('foto HEIC convertida (%s) → se sube como JPG con nombre .jpg', async (_caso, over) => {
  picker.launchImageLibraryAsync.mockResolvedValue(picked(over));
  await expect(pickScheduleImage('gallery')).resolves.toEqual({
    kind: 'picked', image: { uri: over.uri, mimeType: 'image/jpeg', fileName: 'horario.jpg' },
  });
});
