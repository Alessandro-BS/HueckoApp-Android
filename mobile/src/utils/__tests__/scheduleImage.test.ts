import * as ImagePicker from 'expo-image-picker';

import { IMAGE_MESSAGES, pickScheduleImage } from '../scheduleImage';

const picker = jest.mocked(ImagePicker);
const asset = (over: Record<string, unknown> = {}) => ({
  uri: 'file:///horario.jpg', mimeType: 'image/jpeg', fileName: 'horario.jpg', fileSize: 1_000_000, width: 1200, height: 900, ...over,
});
const picked = (over: Record<string, unknown> = {}) => ({ canceled: false, assets: [asset(over)] }) as any;

beforeEach(() => jest.clearAllMocks());

it('galería: sin pedir permiso (selector del sistema), solo imágenes y comprimidas', async () => {
  picker.launchImageLibraryAsync.mockResolvedValue(picked());
  await expect(pickScheduleImage('gallery')).resolves.toEqual({
    kind: 'picked', image: { uri: 'file:///horario.jpg', mimeType: 'image/jpeg', fileName: 'horario.jpg' },
  });
  expect(picker.requestCameraPermissionsAsync).not.toHaveBeenCalled();
  expect(picker.launchImageLibraryAsync).toHaveBeenCalledWith({ mediaTypes: ['images'], quality: 0.7 });
});

it('cámara: pide permiso y abre la cámara', async () => {
  picker.requestCameraPermissionsAsync.mockResolvedValue({ granted: true, canAskAgain: true } as any);
  picker.launchCameraAsync.mockResolvedValue(picked({ mimeType: 'image/png', fileName: null, uri: 'file:///foto.png' }));
  await expect(pickScheduleImage('camera')).resolves.toEqual({
    kind: 'picked', image: { uri: 'file:///foto.png', mimeType: 'image/png', fileName: 'horario.png' },
  });
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

it.each([
  [{ mimeType: 'image/heic' }, IMAGE_MESSAGES.unsupported],
  [{ fileSize: 5 * 1024 * 1024 + 1 }, IMAGE_MESSAGES.tooLarge],
])('rechaza antes de subir: %j', async (over, message) => {
  picker.launchImageLibraryAsync.mockResolvedValue(picked(over));
  await expect(pickScheduleImage('gallery')).resolves.toEqual({ kind: 'error', message, canOpenSettings: false });
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
