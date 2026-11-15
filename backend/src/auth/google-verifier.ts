import { OAuth2Client } from 'google-auth-library';

export type GoogleIdentity = { sub: string; email: string; emailVerified: boolean; name: string };

export interface GoogleVerifier {
  /** La identidad que prueba el idToken de Google, o null si el token no es válido. */
  verify(idToken: string): Promise<GoogleIdentity | null>;
}

// Lo único que se usa de OAuth2Client (los tests inyectan uno falso: nunca se llama a Google).
export type IdTokenClient = {
  verifyIdToken(options: { idToken: string; audience: string }): Promise<{ getPayload(): unknown }>;
};

type Payload = { sub?: unknown; email?: unknown; email_verified?: unknown; name?: unknown };

export function createGoogleVerifier(webClientId: string, client: IdTokenClient = new OAuth2Client()): GoogleVerifier {
  return {
    async verify(idToken) {
      try {
        const ticket = await client.verifyIdToken({ idToken, audience: webClientId });
        const payload = (ticket.getPayload() ?? {}) as Payload;
        if (typeof payload.sub !== 'string' || !payload.sub || typeof payload.email !== 'string' || !payload.email) return null;
        const name = typeof payload.name === 'string' ? payload.name.trim() : '';
        return {
          sub: payload.sub,
          email: payload.email.trim().toLowerCase(),
          emailVerified: payload.email_verified === true,
          name: name || payload.email.split('@')[0]!,
        };
      } catch {
        return null;
      }
    },
  };
}
