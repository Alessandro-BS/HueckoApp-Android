// Reglas de los códigos que se mandan por correo (spec de cuentas, «Reglas del código»).
export const CODE_TTL_MINUTES = 15;
/** Intentos con código malo antes de quemar el reto (el quinto fallo lo consume). */
export const MAX_ATTEMPTS = 5;
export const RESEND_COOLDOWN_SECONDS = 60;
export const MAX_SENDS_PER_CHALLENGE = 5;
/** Correos con código por cuenta en 24 h, de todos los propósitos. */
export const DAILY_EMAIL_LIMIT = 10;

export const CHALLENGE_PURPOSES = ['VERIFY_EMAIL', 'LOGIN_2FA', 'RESET_PASSWORD', 'ENABLE_2FA'] as const;
export type ChallengePurpose = (typeof CHALLENGE_PURPOSES)[number];
