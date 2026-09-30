import { AxiosError, type AxiosAdapter, type InternalAxiosRequestConfig } from 'axios';

import { api, ApiError, errorMessage, setAuthToken, setUnauthorizedHandler } from '../client';

const original = api.defaults.adapter;

// Adaptador falso: rechaza con un AxiosError (con o sin respuesta) para ejercitar el interceptor.
const failWith = (status: number | null, data?: unknown, code?: string): AxiosAdapter => (config) =>
  Promise.reject(
    new AxiosError(
      'fallo',
      code,
      config as InternalAxiosRequestConfig,
      null,
      status === null
        ? undefined
        : { status, statusText: '', headers: {}, config: config as InternalAxiosRequestConfig, data },
    ),
  );

const handler = jest.fn();

beforeEach(() => {
  handler.mockClear();
  setUnauthorizedHandler(handler);
  setAuthToken(null);
});

afterAll(() => {
  api.defaults.adapter = original;
  setUnauthorizedHandler(null);
  setAuthToken(null);
});

describe('interceptor de respuesta', () => {
  it('401 enviado con el token vigente llama al handler una vez', async () => {
    setAuthToken('vigente');
    api.defaults.adapter = failWith(401, { error: { code: 'UNAUTHORIZED', message: 'Expiró' } });
    await expect(api.get('/auth/me')).rejects.toBeInstanceOf(ApiError);
    expect(handler).toHaveBeenCalledTimes(1);
  });

  it('401 de una petición enviada con un token viejo NO llama al handler', async () => {
    setAuthToken('viejo');
    api.defaults.adapter = (config) => {
      // La sesión cambia mientras la petición está en vuelo.
      setAuthToken('nuevo');
      return failWith(401)(config);
    };
    await expect(api.get('/auth/me')).rejects.toBeInstanceOf(ApiError);
    expect(handler).not.toHaveBeenCalled();
  });

  it('401 sin sesión (login fallido) NO llama al handler', async () => {
    api.defaults.adapter = failWith(401, { error: { code: 'INVALID_CREDENTIALS', message: 'Mal' } });
    await expect(api.post('/auth/login', {})).rejects.toMatchObject({ status: 401, code: 'INVALID_CREDENTIALS' });
    expect(handler).not.toHaveBeenCalled();
  });

  it('sin respuesta → ApiError 0 NETWORK_ERROR', async () => {
    api.defaults.adapter = failWith(null);
    await expect(api.get('/x')).rejects.toMatchObject({
      status: 0,
      code: 'NETWORK_ERROR',
      message: 'No se pudo conectar con el servidor. Revisa tu conexión.',
    });
  });

  it.each(['ECONNABORTED', 'ETIMEDOUT'])('tiempo agotado (%s) → ApiError 0 TIMEOUT con su propio mensaje', async (code) => {
    api.defaults.adapter = failWith(null, undefined, code);
    await expect(api.get('/x')).rejects.toMatchObject({
      status: 0,
      code: 'TIMEOUT',
      message: 'El servidor tardó demasiado en responder. Inténtalo de nuevo.',
    });
  });

  it('mapea el cuerpo de error a ApiError(status, code, message, details)', async () => {
    api.defaults.adapter = failWith(409, { error: { code: 'EMAIL_TAKEN', message: 'Ya existe', details: [1] } });
    const error = await api.post('/auth/register', {}).catch((e: unknown) => e);
    expect(error).toBeInstanceOf(ApiError);
    expect(error).toMatchObject({ status: 409, code: 'EMAIL_TAKEN', message: 'Ya existe', details: [1] });
  });
});

describe('errorMessage', () => {
  it('usa el mensaje del primer detalle en VALIDATION_ERROR', () => {
    const e = new ApiError(400, 'VALIDATION_ERROR', 'Datos inválidos', [{ message: 'Máximo 80 caracteres' }]);
    expect(errorMessage(e)).toBe('Máximo 80 caracteres');
  });

  it.each([
    [null],
    [[]],
    [[{ path: ['name'] }]],
    [[{ message: 5 }]],
  ])('VALIDATION_ERROR con details %j usa el mensaje general', (details) => {
    expect(errorMessage(new ApiError(400, 'VALIDATION_ERROR', 'Datos inválidos', details))).toBe('Datos inválidos');
  });

  it('otros ApiError usan su mensaje y lo desconocido el genérico', () => {
    expect(errorMessage(new ApiError(409, 'EMAIL_TAKEN', 'Ya existe'))).toBe('Ya existe');
    expect(errorMessage(new Error('x'))).toBe('Ocurrió un error inesperado.');
  });
});

describe('fin de sesión por suspensión (D14)', () => {
  it('401 avisa con el motivo UNAUTHORIZED y el mensaje del servidor', async () => {
    setAuthToken('vigente');
    api.defaults.adapter = failWith(401, { error: { code: 'UNAUTHORIZED', message: 'Tu sesión expiró.' } });
    await expect(api.get('/auth/me')).rejects.toBeInstanceOf(ApiError);
    expect(handler).toHaveBeenCalledWith('UNAUTHORIZED', 'Tu sesión expiró.');
  });

  it('403 ACCOUNT_SUSPENDED con el token vigente avisa con su mensaje; otro 403 no cierra sesión', async () => {
    setAuthToken('vigente');
    api.defaults.adapter = failWith(403, { error: { code: 'NOT_A_MEMBER', message: 'No perteneces a este grupo.' } });
    await expect(api.get('/groups/g1')).rejects.toMatchObject({ status: 403, code: 'NOT_A_MEMBER' });
    expect(handler).not.toHaveBeenCalled();
    api.defaults.adapter = failWith(403, { error: { code: 'ACCOUNT_SUSPENDED', message: 'Tu cuenta está suspendida.' } });
    await expect(api.get('/groups')).rejects.toMatchObject({ status: 403, code: 'ACCOUNT_SUSPENDED' });
    expect(handler).toHaveBeenCalledTimes(1);
    expect(handler).toHaveBeenCalledWith('ACCOUNT_SUSPENDED', 'Tu cuenta está suspendida.');
  });

  it('403 ACCOUNT_SUSPENDED de una petición enviada con un token viejo se ignora', async () => {
    setAuthToken('viejo');
    api.defaults.adapter = (config) => {
      setAuthToken('nuevo'); // la sesión cambia mientras la petición está en vuelo
      return failWith(403, { error: { code: 'ACCOUNT_SUSPENDED', message: 'Tu cuenta está suspendida.' } })(config);
    };
    await expect(api.get('/groups')).rejects.toMatchObject({ status: 403, code: 'ACCOUNT_SUSPENDED' });
    expect(handler).not.toHaveBeenCalled();
  });

  it('403 ACCOUNT_SUSPENDED sin sesión (el login) no llama al manejador', async () => {
    api.defaults.adapter = failWith(403, { error: { code: 'ACCOUNT_SUSPENDED', message: 'Tu cuenta está suspendida.' } });
    await expect(api.post('/auth/login', {})).rejects.toMatchObject({ code: 'ACCOUNT_SUSPENDED', message: 'Tu cuenta está suspendida.' });
    expect(handler).not.toHaveBeenCalled();
  });
});
