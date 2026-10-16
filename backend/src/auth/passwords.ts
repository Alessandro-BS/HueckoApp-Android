import bcrypt from 'bcryptjs';

const COST = 10;

export const hashPassword = (plain: string) => bcrypt.hash(plain, COST);
export const verifyPassword = (plain: string, hash: string) => bcrypt.compare(plain, hash);

// Hash válido de una contraseña que nadie usa. Se compara contra él cuando el correo
// no existe, para que la respuesta tarde lo mismo y no delate qué correos están registrados.
export const DUMMY_HASH = bcrypt.hashSync('hueckoapp-dummy-password', COST);
