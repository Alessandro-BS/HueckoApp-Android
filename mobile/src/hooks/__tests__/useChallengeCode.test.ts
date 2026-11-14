import { act, renderHook } from '@testing-library/react-native';

import * as authApi from '../../api/auth';
import { ApiError } from '../../api/client';
import { showToast } from '../../utils/toast';
import { useChallengeCode } from '../useChallengeCode';

jest.mock('../../api/auth');
jest.mock('../../utils/toast', () => ({ showToast: jest.fn() }));
const mocked = authApi as jest.Mocked<typeof authApi>;

const NOW = new Date('2026-01-01T00:00:00.000Z');
const challenge = (secondsToResend = 0) => ({
  id: 'c1',
  purpose: 'ENABLE_2FA' as const,
  emailHint: 'a***@correo.com',
  resendAvailableAt: new Date(NOW.getTime() + secondsToResend * 1000).toISOString(),
});

beforeEach(() => {
  jest.clearAllMocks();
  jest.useFakeTimers({ now: NOW });
});
afterEach(() => jest.useRealTimers());

describe('submit', () => {
  it('con menos de 6 dígitos no ejecuta la acción y avisa', async () => {
    const { result } = await renderHook(() => useChallengeCode(challenge()));
    const action = jest.fn();
    await act(async () => result.current.setCode('123'));
    await act(() => result.current.submit(action));
    expect(action).not.toHaveBeenCalled();
    expect(result.current.serverError).toBe('Escribe los 6 dígitos del código.');
  });

  it('si validate devuelve false no ejecuta la acción', async () => {
    const { result } = await renderHook(() => useChallengeCode(challenge()));
    const action = jest.fn();
    await act(async () => result.current.setCode('123456'));
    await act(() => result.current.submit(action, () => false));
    expect(action).not.toHaveBeenCalled();
  });

  it('ejecuta la acción con el código', async () => {
    const { result } = await renderHook(() => useChallengeCode(challenge()));
    const action = jest.fn(async () => undefined);
    await act(async () => result.current.setCode('123456'));
    await act(() => result.current.submit(action));
    expect(action).toHaveBeenCalledWith('123456');
    expect(result.current.serverError).toBeNull();
  });

  it('CODE_INVALID muestra el mensaje y vacía el código', async () => {
    const { result } = await renderHook(() => useChallengeCode(challenge()));
    await act(async () => result.current.setCode('123456'));
    await act(() => result.current.submit(async () => Promise.reject(new ApiError(400, 'CODE_INVALID', 'Código incorrecto.'))));
    expect(result.current.serverError).toBe('Código incorrecto.');
    expect(result.current.code).toBe('');
    expect(result.current.expired).toBe(false);
  });

  it('CHALLENGE_EXPIRED marca el reto como vencido y bloquea otro envío', async () => {
    const { result } = await renderHook(() => useChallengeCode(challenge()));
    await act(async () => result.current.setCode('123456'));
    await act(() => result.current.submit(async () => Promise.reject(new ApiError(410, 'CHALLENGE_EXPIRED', 'Pide un código nuevo.'))));
    expect(result.current.expired).toBe(true);
    expect(result.current.canResend).toBe(false);
    const action = jest.fn();
    await act(() => result.current.submit(action));
    expect(action).not.toHaveBeenCalled();
  });
});

describe('resend', () => {
  it('no hace nada mientras corre la cuenta atrás', async () => {
    const { result } = await renderHook(() => useChallengeCode(challenge(60)));
    expect(result.current.secondsLeft).toBe(60);
    await act(() => result.current.resend());
    expect(mocked.resendChallengeRequest).not.toHaveBeenCalled();
  });

  it('reenvía, avisa y reinicia la cuenta atrás en 60 s', async () => {
    mocked.resendChallengeRequest.mockResolvedValue(undefined);
    const { result } = await renderHook(() => useChallengeCode(challenge(0)));
    await act(() => result.current.resend());
    expect(mocked.resendChallengeRequest).toHaveBeenCalledWith('c1');
    expect(showToast).toHaveBeenCalledWith('Te enviamos un código nuevo.');
    expect(result.current.secondsLeft).toBe(60);
  });

  it('RESEND_TOO_SOON reinicia la cuenta con retryAfterSeconds y sin error', async () => {
    mocked.resendChallengeRequest.mockRejectedValue(new ApiError(429, 'RESEND_TOO_SOON', 'x', { retryAfterSeconds: 30 }));
    const { result } = await renderHook(() => useChallengeCode(challenge(0)));
    await act(() => result.current.resend());
    expect(result.current.secondsLeft).toBe(30);
    expect(result.current.serverError).toBeNull();
  });

  it('CHALLENGE_EXPIRED al reenviar muestra el mensaje y marca vencido', async () => {
    mocked.resendChallengeRequest.mockRejectedValue(new ApiError(410, 'CHALLENGE_EXPIRED', 'Pide un código nuevo.'));
    const { result } = await renderHook(() => useChallengeCode(challenge(0)));
    await act(() => result.current.resend());
    expect(result.current.serverError).toBe('Pide un código nuevo.');
    expect(result.current.expired).toBe(true);
  });
});
