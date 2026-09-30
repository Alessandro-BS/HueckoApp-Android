import { z } from 'zod';

// ?search=&page= de las listas (D10). `search` vacío = sin filtro.
export const listQuerySchema = z.object({
  search: z
    .string({ error: 'La búsqueda debe ser un texto.' })
    .trim()
    .max(100, 'La búsqueda admite hasta 100 caracteres.')
    .default(''),
  page: z.coerce
    .number({ error: 'La página debe ser un número.' })
    .int('La página debe ser un número entero.')
    .min(1, 'La página empieza en 1.')
    .max(100_000, 'Página demasiado alta.')
    .default(1),
});

export const pageQuerySchema = listQuerySchema.pick({ page: true });

export const userStatusSchema = z.object({
  status: z.enum(['ACTIVE', 'SUSPENDED'], { error: 'El estado debe ser ACTIVE o SUSPENDED.' }),
});

export const userRoleSchema = z.object({
  role: z.enum(['USER', 'ADMIN'], { error: 'El rol debe ser USER o ADMIN.' }),
});

// POST /admin/proposals/:id/cancel: motivo opcional para el registro de acciones.
export const cancelProposalSchema = z.object({
  reason: z.string({ error: 'El motivo debe ser un texto.' }).trim().max(200, 'El motivo admite hasta 200 caracteres.').optional(),
});
