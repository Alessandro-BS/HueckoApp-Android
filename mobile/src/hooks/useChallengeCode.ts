import type { Challenge } from '@hueckoapp/shared';
import { useState } from 'react';

import { resendChallengeRequest } from '../api/auth';
import { ApiError, errorMessage } from '../api/client';
import { showToast } from '../utils/toast';
import { useResendCountdown } from './useResendCountdown';

export const CODE_LENGTH = 6;

/**
 * Estado común de las pantallas que piden el código del correo (VerifyCode y EnableTwoFactor): el código, el error del
 * servidor, si el reto venció, la cuenta atrás de «Reenviar código» y el reenvío con sus errores.
 */
export function useChallengeCode(challenge: Challenge) {
  const [code, setCodeState] = useState('');
  const [serverError, setServerError] = useState<string | null>(null);
  const [expired, setExpired] = useState(false);
  const [loading, setLoading] = useState(false);
  const [resending, setResending] = useState(false);
  const { secondsLeft, restart } = useResendCountdown(challenge.resendAvailableAt);

  const setCode = (value: string) => {
    setCodeState(value);
    setServerError(null);
  };

  /** CODE_INVALID: mensaje y campo vacío; CHALLENGE_EXPIRED: mensaje y se ofrece volver. */
  const handleVerifyError = (e: unknown) => {
    setServerError(errorMessage(e));
    if (e instanceof ApiError && e.code === 'CHALLENGE_EXPIRED') setExpired(true);
    else if (e instanceof ApiError && e.code === 'CODE_INVALID') setCodeState('');
  };

  /** Valida los 6 dígitos (y `validate`, si hay) y ejecuta `action(code)` con la carga y los errores resueltos. */
  const submit = async (action: (code: string) => Promise<void>, validate?: () => boolean) => {
    if (loading || expired) return;
    if (code.length !== CODE_LENGTH) {
      setServerError('Escribe los 6 dígitos del código.');
      return;
    }
    if (validate && !validate()) return;
    setServerError(null);
    setLoading(true);
    try {
      await action(code);
    } catch (e) {
      handleVerifyError(e);
    } finally {
      setLoading(false);
    }
  };

  const canResend = secondsLeft === 0 && !resending && !expired;

  const resend = async () => {
    if (!canResend) return;
    setResending(true);
    setServerError(null);
    try {
      await resendChallengeRequest(challenge.id);
      showToast('Te enviamos un código nuevo.');
      restart(new Date(Date.now() + 60_000).toISOString());
    } catch (e) {
      if (e instanceof ApiError && e.code === 'RESEND_TOO_SOON') {
        const retry = (e.details as { retryAfterSeconds?: unknown } | null)?.retryAfterSeconds;
        if (typeof retry === 'number') restart(new Date(Date.now() + retry * 1000).toISOString());
      } else {
        setServerError(errorMessage(e));
        if (e instanceof ApiError && e.code === 'CHALLENGE_EXPIRED') setExpired(true);
      }
    } finally {
      setResending(false);
    }
  };

  return { code, setCode, serverError, expired, loading, resending, secondsLeft, canResend, submit, resend };
}
