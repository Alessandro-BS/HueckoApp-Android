import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const { create, constructed } = vi.hoisted(() => ({ create: vi.fn(), constructed: vi.fn() }));
vi.mock('@google/genai', () => ({
  GoogleGenAI: class {
    interactions = { create };
    constructor(options: unknown) {
      constructed(options);
    }
  },
}));

import { z } from 'zod';

import { askAi } from '../src/ai/ask-ai';
import { AI_SYSTEM_INSTRUCTION, createGeminiClient } from '../src/ai/gemini-client';

const OPTIONS = { apiKey: 'clave-de-prueba', model: 'gemini-3.8-flash', fallbackModel: 'gemini-3.5-flash', timeoutMs: 30_000 };
const SCHEMA = { type: 'object', properties: { ok: { type: 'boolean' } } };
const REQUEST = { task: 'voting-summary' as const, prompt: 'x', schema: SCHEMA };
const NO_RETRIES = { strategy: 'none' };

const providerError = (fields: { status?: number | string; code?: number | string }) =>
  Object.assign(new Error('error del proveedor'), fields);

beforeEach(() => vi.clearAllMocks());
afterEach(() => vi.useRealTimers());

describe('createGeminiClient', () => {
  it('usa la clave y pide JSON con el esquema, sin guardar la interacción, sin reintentos del SDK y con tiempo máximo', async () => {
    create.mockResolvedValue({ output_text: '{"ok":true}' });
    const client = createGeminiClient(OPTIONS);
    expect(client.provider).toBe('gemini');
    await expect(client.generateJson({ task: 'voting-summary', prompt: 'Resume', schema: SCHEMA })).resolves.toBe('{"ok":true}');
    expect(constructed).toHaveBeenCalledWith({ apiKey: 'clave-de-prueba' });
    expect(create).toHaveBeenCalledTimes(1);
    expect(create).toHaveBeenCalledWith(
      {
        model: 'gemini-3.8-flash',
        input: 'Resume',
        system_instruction: AI_SYSTEM_INSTRUCTION,
        response_format: { type: 'text', mime_type: 'application/json', schema: SCHEMA },
        store: false,
      },
      { timeout_ms: 20_000, retries: NO_RETRIES },
    );
  });

  it('con imagen envía el texto y la imagen en base64', async () => {
    create.mockResolvedValue({ output_text: '{"blocks":[]}' });
    const client = createGeminiClient(OPTIONS);
    await client.generateJson({ task: 'schedule-ocr', prompt: 'Lee', schema: SCHEMA, image: { data: Buffer.from('hola'), mimeType: 'image/png' } });
    expect(create.mock.calls[0][0].input).toEqual([
      { type: 'text', text: 'Lee' },
      { type: 'image', data: Buffer.from('hola').toString('base64'), mime_type: 'image/png' },
    ]);
  });

  it('sin texto en la respuesta devuelve "" (askAi lo convierte en 502)', async () => {
    create.mockResolvedValue({});
    await expect(createGeminiClient(OPTIONS).generateJson(REQUEST)).resolves.toBe('');
  });

  it('propaga los errores del proveedor (askAi los convierte en 503)', async () => {
    create.mockRejectedValue(new Error('503 Service Unavailable'));
    await expect(createGeminiClient(OPTIONS).generateJson(REQUEST)).rejects.toThrow('503');
  });
});

describe('modelo de respaldo', () => {
  it.each([
    ['503', { status: 503 }],
    ['429', { status: 429 }],
    ['UNAVAILABLE', { status: 'UNAVAILABLE' }],
    ['RESOURCE_EXHAUSTED', { code: 'RESOURCE_EXHAUSTED' }],
  ])('si el principal responde %s reintenta una vez con el de respaldo', async (_name, fields) => {
    create.mockRejectedValueOnce(providerError(fields)).mockResolvedValueOnce({ output_text: '{"ok":true}' });
    await expect(createGeminiClient(OPTIONS).generateJson(REQUEST)).resolves.toBe('{"ok":true}');
    expect(create).toHaveBeenCalledTimes(2);
    expect(create.mock.calls[0][0].model).toBe('gemini-3.8-flash');
    expect(create.mock.calls[1][0].model).toBe('gemini-3.5-flash');
    expect(create.mock.calls[1][1].retries).toEqual(NO_RETRIES);
  });

  it('un 400 no se reintenta', async () => {
    create.mockRejectedValue(providerError({ status: 400 }));
    await expect(createGeminiClient(OPTIONS).generateJson(REQUEST)).rejects.toThrow('error del proveedor');
    expect(create).toHaveBeenCalledTimes(1);
  });

  it('si el respaldo también falla, el error sale y askAi responde 503 AI_UNAVAILABLE (solo 2 llamadas)', async () => {
    create.mockRejectedValue(providerError({ status: 503 }));
    await expect(askAi(createGeminiClient(OPTIONS), REQUEST, z.object({}))).rejects.toMatchObject({
      status: 503,
      code: 'AI_UNAVAILABLE',
    });
    expect(create).toHaveBeenCalledTimes(2);
  });

  it('GEMINI_TIMEOUT_MS es un tope total: el respaldo solo tiene el tiempo que queda', async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date(2026, 8, 29, 10, 0, 0));
    create.mockImplementationOnce(async () => {
      vi.advanceTimersByTime(12_000);
      throw providerError({ status: 503 });
    });
    create.mockResolvedValueOnce({ output_text: '{}' });
    await createGeminiClient(OPTIONS).generateJson(REQUEST);
    expect(create.mock.calls[0][1].timeout_ms).toBe(20_000);
    expect(create.mock.calls[1][1].timeout_ms).toBe(18_000);
  });

  it('si ya no queda tiempo no se intenta el respaldo', async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date(2026, 8, 29, 10, 0, 0));
    create.mockImplementationOnce(async () => {
      vi.advanceTimersByTime(30_000);
      throw providerError({ status: 503 });
    });
    await expect(createGeminiClient(OPTIONS).generateJson(REQUEST)).rejects.toThrow('error del proveedor');
    expect(create).toHaveBeenCalledTimes(1);
  });

  it('si el principal agota su tiempo (2/3) prueba el respaldo con el tiempo que queda', async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date(2026, 8, 29, 10, 0, 0));
    create.mockImplementationOnce(async () => {
      vi.advanceTimersByTime(20_000);
      throw Object.assign(new Error('Request timed out.'), { name: 'APIConnectionTimeoutError' });
    });
    create.mockResolvedValueOnce({ output_text: '{"ok":true}' });
    await expect(createGeminiClient(OPTIONS).generateJson(REQUEST)).resolves.toBe('{"ok":true}');
    expect(create.mock.calls[1][0].model).toBe('gemini-3.5-flash');
    expect(create.mock.calls[1][1].timeout_ms).toBe(10_000);
  });

  it('si el respaldo también agota su tiempo, el error sale y askAi responde 503', async () => {
    const timeout = () => Object.assign(new Error('Request timed out.'), { name: 'APIConnectionTimeoutError' });
    create.mockRejectedValue(timeout());
    await expect(askAi(createGeminiClient(OPTIONS), REQUEST, z.object({}))).rejects.toMatchObject({ status: 503, code: 'AI_UNAVAILABLE' });
    expect(create).toHaveBeenCalledTimes(2);
  });

  it('sin modelo de respaldo distinto no hay segundo intento', async () => {
    create.mockRejectedValue(Object.assign(new Error('t'), { name: 'APIConnectionTimeoutError' }));
    await expect(createGeminiClient({ ...OPTIONS, fallbackModel: OPTIONS.model }).generateJson(REQUEST)).rejects.toThrow();
    expect(create).toHaveBeenCalledTimes(1);
  });
});
