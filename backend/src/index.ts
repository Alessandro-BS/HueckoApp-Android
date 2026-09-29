import { mkdirSync } from 'node:fs';
import { dirname } from 'node:path';

import { createApp } from './app';
import { env } from './config/env';
import { openDatabase } from './db/database';

mkdirSync(dirname(env.DATABASE_PATH), { recursive: true });
const db = openDatabase(env.DATABASE_PATH);

createApp({ db, jwtSecret: env.JWT_SECRET, jwtExpiresIn: env.JWT_EXPIRES_IN }).listen(env.PORT, () => {
  console.log(`HueckoApp API escuchando en http://localhost:${env.PORT}/api`);
});
