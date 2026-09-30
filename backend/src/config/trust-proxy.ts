import { z } from 'zod';

// Valor de app.set('trust proxy'): false = ningún proxy delante (por defecto), número = cuántos saltos de proxy
// se confían (1 en un PaaS típico), true = todos (no recomendado: cualquiera inventaría su IP con X-Forwarded-For).
export type TrustProxy = boolean | number;

export const trustProxySchema = z
  .string()
  .trim()
  .toLowerCase()
  .default('false')
  .transform((value, ctx): TrustProxy => {
    if (value === '' || value === 'false') return false;
    if (value === 'true') return true;
    if (/^\d+$/.test(value)) return Number(value);
    ctx.addIssue({ code: 'custom', message: 'TRUST_PROXY debe ser false, true o el número de proxies delante del servidor (p. ej. 1)' });
    return z.NEVER;
  });
