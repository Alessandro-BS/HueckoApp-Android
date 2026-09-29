// Mismas reglas que el backend (backend/src/auth/auth.schemas.ts).
const EMAIL_REGEX = /^[^@\s]+@[^@\s]+\.[^@\s]+$/;
export const PASSWORD_MIN = 8;
export const PASSWORD_MAX = 72; // límite de bcrypt
export const NAME_MAX = 80;

export function validateEmail(value: string): string | null {
  const v = value.trim();
  if (!v) return 'El correo es requerido';
  if (!EMAIL_REGEX.test(v)) return 'Ingresa un correo válido';
  return null;
}

export function validatePassword(value: string): string | null {
  if (!value.trim()) return 'La contraseña es requerida';
  if (value.length < PASSWORD_MIN) return `Mínimo ${PASSWORD_MIN} caracteres`;
  if (value.length > PASSWORD_MAX) return `Máximo ${PASSWORD_MAX} caracteres`;
  return null;
}

export function validateName(value: string): string | null {
  const v = value.trim();
  if (!v) return 'El nombre es requerido';
  if (v.length > NAME_MAX) return `Máximo ${NAME_MAX} caracteres`;
  return null;
}
