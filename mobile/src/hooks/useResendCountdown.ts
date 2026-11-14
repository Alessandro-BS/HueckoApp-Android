import { useCallback, useEffect, useState } from 'react';

const secondsUntil = (iso: string) => Math.max(0, Math.ceil((new Date(iso).getTime() - Date.now()) / 1000));

/** Segundos que faltan para poder pedir otro código; `restart` fija otra hora de desbloqueo (ISO). */
export function useResendCountdown(resendAvailableAt: string) {
  const [target, setTarget] = useState(resendAvailableAt);
  const [secondsLeft, setSecondsLeft] = useState(() => secondsUntil(resendAvailableAt));

  useEffect(() => {
    setSecondsLeft(secondsUntil(target));
    const timer = setInterval(() => {
      const left = secondsUntil(target);
      setSecondsLeft(left);
      if (left === 0) clearInterval(timer);
    }, 1000);
    return () => clearInterval(timer);
  }, [target]);

  const restart = useCallback((nextIso: string) => setTarget(nextIso), []);
  return { secondsLeft, restart };
}
