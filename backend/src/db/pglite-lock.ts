import { closeSync, openSync, readFileSync, rmSync, writeSync } from 'node:fs';
import { setTimeout as sleep } from 'node:timers/promises';

// Cuánto espera un proceso a que otro suelte la base (p. ej. `tsx watch` reiniciando el servidor).
export const LOCK_WAIT_MS = 5000;
const STEP_MS = 200;

function isAlive(pid: number): boolean {
  if (!Number.isInteger(pid) || pid <= 0) return false;
  try {
    process.kill(pid, 0); // señal 0: solo comprueba que el proceso existe
    return true;
  } catch (error) {
    return (error as NodeJS.ErrnoException).code === 'EPERM'; // existe, pero es de otro usuario
  }
}

/**
 * PGlite no protege su carpeta: dos procesos abiertos a la vez la corromperían sin avisar (D10). Este candado
 * (`<carpeta>.lock` con el pid de quien la tiene abierta) hace que el segundo falle con un mensaje claro. El candado de
 * un proceso que ya no existe se recupera. Devuelve la función que lo suelta.
 */
export async function acquireDataDirLock(dataDir: string, waitMs = LOCK_WAIT_MS): Promise<() => void> {
  const path = `${dataDir}.lock`;
  const deadline = Date.now() + waitMs;
  for (;;) {
    try {
      const fd = openSync(path, 'wx'); // falla si ya existe: crear y comprobar es una sola operación
      writeSync(fd, String(process.pid));
      closeSync(fd);
      return () => rmSync(path, { force: true });
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== 'EEXIST') throw error;
    }
    let owner: number;
    try {
      owner = Number(readFileSync(path, 'utf8'));
    } catch {
      continue; // lo soltaron justo ahora: se vuelve a intentar
    }
    if (!Number.isNaN(owner) && !isAlive(owner)) {
      rmSync(path, { force: true }); // candado huérfano (el proceso murió sin soltarlo)
      continue;
    }
    if (Date.now() >= deadline) {
      throw new Error(
        `La base local «${dataDir}» está abierta por otro proceso (pid ${owner}), probablemente el servidor (npm run backend). ` +
          `PGlite solo admite un proceso a la vez: detenlo y vuelve a intentarlo. Si no hay ninguno abierto, borra «${path}».`,
      );
    }
    await sleep(STEP_MS);
  }
}
