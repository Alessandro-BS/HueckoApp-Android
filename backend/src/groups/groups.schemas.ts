import { z } from 'zod';

import { normalizeInviteCode } from './invite-code';

const name = z.string({ error: 'El nombre es requerido' }).trim().min(1, 'El nombre es requerido').max(60, 'Máximo 60 caracteres');
const description = z.string({ error: 'La descripción debe ser texto' }).trim().max(200, 'Máximo 200 caracteres');
const threshold = z
  .number({ error: 'El umbral debe ser un número' })
  .int('El umbral debe ser un entero')
  .min(0, 'El umbral va de 0 a 100')
  .max(100, 'El umbral va de 0 a 100');

export const createGroupSchema = z.object({
  name,
  description: description.default(''),
  availabilityThreshold: threshold.default(80),
});

export const updateGroupSchema = z
  .object({ name: name.optional(), description: description.optional(), availabilityThreshold: threshold.optional() })
  .refine(
    (patch) => patch.name !== undefined || patch.description !== undefined || patch.availabilityThreshold !== undefined,
    'Envía al menos un campo',
  );

// Máximo 32 para aceptar también los códigos de la semilla (PROY2026, HUECKO123), que no siguen el formato nuevo.
export const joinGroupSchema = z.object({
  inviteCode: z
    .string({ error: 'El código es requerido' })
    .trim()
    .min(1, 'El código es requerido')
    .max(32, 'Código de invitación inválido.')
    .transform(normalizeInviteCode),
});

export const updateMemberSchema = z.object({
  isEssential: z.boolean({ error: 'isEssential debe ser true o false' }),
});
