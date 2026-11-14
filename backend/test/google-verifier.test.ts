import { describe, expect, it } from 'vitest';

import { createGoogleVerifier, type IdTokenClient } from '../src/auth/google-verifier';

const clientReturning = (payload: unknown): IdTokenClient & { calls: unknown[] } => {
  const calls: unknown[] = [];
  return {
    calls,
    verifyIdToken: async (options) => {
      calls.push(options);
      return { getPayload: () => payload };
    },
  };
};

describe('createGoogleVerifier', () => {
  it('mapea el payload y verifica contra el client id web', async () => {
    const client = clientReturning({ sub: '123', email: 'Ana@Correo.com', email_verified: true, name: ' Ana Pérez ' });
    const identity = await createGoogleVerifier('web-id', client).verify('tok');
    expect(identity).toEqual({ sub: '123', email: 'ana@correo.com', emailVerified: true, name: 'Ana Pérez' });
    expect(client.calls).toEqual([{ idToken: 'tok', audience: 'web-id' }]);
  });

  it('sin nombre usa la parte del correo antes de la @; email_verified ausente es false', async () => {
    const identity = await createGoogleVerifier('web-id', clientReturning({ sub: '1', email: 'ana@correo.com', name: '' })).verify('t');
    expect(identity).toEqual({ sub: '1', email: 'ana@correo.com', emailVerified: false, name: 'ana' });
  });

  it('cualquier excepción o payload sin sub/correo es null', async () => {
    const failing: IdTokenClient = { verifyIdToken: async () => { throw new Error('Wrong recipient'); } };
    expect(await createGoogleVerifier('web-id', failing).verify('t')).toBeNull();
    expect(await createGoogleVerifier('web-id', clientReturning(undefined)).verify('t')).toBeNull();
    expect(await createGoogleVerifier('web-id', clientReturning({ sub: '1' })).verify('t')).toBeNull();
  });
});
