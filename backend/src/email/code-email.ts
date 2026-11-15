import { CODE_TTL_MINUTES, type ChallengePurpose } from '../auth/challenge-rules';
import type { EmailMessage } from './email-client';

const WHAT_FOR: Record<ChallengePurpose, string> = {
  VERIFY_EMAIL: 'verificar tu correo',
  LOGIN_2FA: 'iniciar sesión',
  RESET_PASSWORD: 'restablecer tu contraseña',
  ENABLE_2FA: 'activar la verificación en dos pasos',
};

/** El correo del código (puro): asunto fijo con el código, para qué es y cuándo vence. */
export function codeEmail(purpose: ChallengePurpose, code: string): Omit<EmailMessage, 'to'> {
  const reason = WHAT_FOR[purpose];
  const expiry = `Vence en ${CODE_TTL_MINUTES} minutos.`;
  return {
    subject: `Tu código de HueckoApp: ${code}`,
    text: `Tu código para ${reason} es ${code}. ${expiry}\nSi no fuiste tú, ignora este correo.`,
    html: `<p>Tu código para ${reason} es:</p><p style="font-size:28px;font-weight:bold;letter-spacing:4px">${code}</p><p>${expiry}</p><p>Si no fuiste tú, ignora este correo.</p>`,
  };
}
