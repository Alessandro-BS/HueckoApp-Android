import { defineConfig } from 'vitest/config';

// Las estadísticas agrupan por días y horas en la zona del servidor (D8) y sus tests
// suponen America/Lima (UTC−5 todo el año). Se fija aquí, antes de que arranquen los
// workers (que heredan el entorno), para que `npm test` pase igual en cualquier máquina o CI.
process.env.TZ = 'America/Lima';

export default defineConfig({
  test: {
    env: { TZ: 'America/Lima' },
  },
});
