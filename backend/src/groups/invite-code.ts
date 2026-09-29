import { randomBytes } from 'node:crypto';

// 32 símbolos: A–Z sin I ni O, y 2–9 (sin 0 ni 1), para que no se confundan al dictarlos (domain spec G11).
export const INVITE_ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
export const INVITE_CODE_LENGTH = 8;

// 256 es múltiplo de 32: cada byte elige un símbolo sin sesgo.
export function generateInviteCode(bytes: (n: number) => Uint8Array = randomBytes): string {
  return Array.from(bytes(INVITE_CODE_LENGTH), (b) => INVITE_ALPHABET[b % INVITE_ALPHABET.length]).join('');
}

// Igual que Kotlin (domain spec G10): lo que el usuario teclee se compara en mayúsculas y sin espacios.
export const normalizeInviteCode = (code: string) => code.trim().toUpperCase();
