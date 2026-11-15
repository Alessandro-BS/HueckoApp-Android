import { z } from 'zod';

export const inviteProximitySchema = z.object({
  groupId: z.string({ error: 'El grupo es requerido' }).trim().min(1, 'El grupo es requerido').max(64, 'Grupo inválido'),
});

// «Unirse» no lleva datos: el grupo sale de la pareja.
export const joinProximitySchema = z.object({});
