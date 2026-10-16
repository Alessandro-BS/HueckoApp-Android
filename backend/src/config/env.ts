import 'dotenv/config';

import { parseEnv } from './env-schema';

// El esquema y sus mensajes están en env-schema.ts.
export const env = parseEnv();
