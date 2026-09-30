import { defineConfig } from 'vitest/config';

// Las estadísticas agrupan por días y horas en la zona del servidor (D8) y sus tests
// suponen America/Lima (UTC−5 todo el año). Se fija aquí, antes de que arranquen los
// workers (que heredan el entorno), para que `npm test` pase igual en cualquier máquina o CI.
process.env.TZ = 'America/Lima';

export default defineConfig({
  test: {
    env: { TZ: 'America/Lima' },
    // Migra una vez la plantilla PGlite que copian todos los tests (test/db.ts).
    globalSetup: ['./test/global-setup.ts'],
    // Cierra después de cada test las bases PGlite que abrió.
    setupFiles: ['./test/setup.ts'],
    // Cada test abre su base PGlite (≈ 0,3 s); con todos los workers a la vez, algunos tardan más.
    testTimeout: 20_000,
    hookTimeout: 20_000,
  },
});
