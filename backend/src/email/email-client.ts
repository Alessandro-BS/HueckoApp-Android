// Envío de correos. Qué mandar y cuándo lo deciden las reglas de src/auth/challenges.ts; aquí solo se entrega.

export type EmailMessage = { to: string; subject: string; text: string; html: string };

/** El correo no salió: red caída, espera agotada o rechazo del proveedor. El mensaje nunca lleva la clave. */
export class EmailSendError extends Error {
  override name = 'EmailSendError';
}

export interface EmailClient {
  /** Lanza `EmailSendError` si el correo no salió. */
  send(message: EmailMessage): Promise<void>;
}

/** Sin proveedor (desarrollo): escribe destinatario, asunto y texto en el log, y así se ve el código. */
export function createConsoleEmailClient(log: (line: string) => void = console.log): EmailClient {
  return {
    async send({ to, subject, text }) {
      log(`[correo] Para: ${to}\n[correo] Asunto: ${subject}\n[correo] ${text}`);
    },
  };
}
