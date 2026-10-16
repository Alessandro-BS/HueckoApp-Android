import { z } from 'zod';

const EMAIL_REGEX = /^[^@\s]+@[^@\s]+\.[^@\s]+$/;

const email = z
  .string({ error: 'El correo es requerido' })
  .trim()
  .min(1, 'El correo es requerido')
  .regex(EMAIL_REGEX, 'Ingresa un correo válido')
  .transform((v) => v.toLowerCase());

export const registerSchema = z.object({
  name: z.string({ error: 'El nombre es requerido' }).trim().min(1, 'El nombre es requerido').max(80),
  email,
  password: z
    .string({ error: 'La contraseña es requerida' })
    .min(8, 'Mínimo 8 caracteres')
    .max(72, 'Máximo 72 caracteres'),
});

export const loginSchema = z.object({
  email,
  password: z.string({ error: 'La contraseña es requerida' }).min(1, 'La contraseña es requerida'),
});
