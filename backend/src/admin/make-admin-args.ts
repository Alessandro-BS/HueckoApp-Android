export const MAKE_ADMIN_USAGE = 'Uso: npm run make-admin -w backend -- <correo> [--revoke]';

export type MakeAdminArgs = { email: string; revoke: boolean };

// Un correo y, opcionalmente, --revoke (en cualquier orden). El correo se normaliza como en el registro.
export function parseMakeAdminArgs(argv: readonly string[]): MakeAdminArgs {
  const flags = argv.filter((a) => a.startsWith('--'));
  const rest = argv.filter((a) => !a.startsWith('--'));
  if (flags.some((f) => f !== '--revoke') || rest.length !== 1) throw new Error(MAKE_ADMIN_USAGE);
  const email = rest[0].trim().toLowerCase();
  if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) throw new Error(`«${rest[0]}» no parece un correo. ${MAKE_ADMIN_USAGE}`);
  return { email, revoke: flags.includes('--revoke') };
}
