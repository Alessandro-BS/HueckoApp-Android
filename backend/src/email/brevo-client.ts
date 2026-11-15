import { type EmailClient, EmailSendError } from './email-client';

// Cliente de la API transaccional de Brevo (https://developers.brevo.com/reference/sendtransacemail).

export const BREVO_URL = 'https://api.brevo.com/v3/smtp/email';
const TIMEOUT_MS_DEFAULT = 10_000;

export function createBrevoEmailClient({
  apiKey,
  senderEmail,
  senderName,
  fetchImpl = fetch,
  timeoutMs = TIMEOUT_MS_DEFAULT,
}: {
  apiKey: string;
  senderEmail: string;
  senderName: string;
  fetchImpl?: typeof fetch;
  timeoutMs?: number;
}): EmailClient {
  return {
    async send({ to, subject, text, html }) {
      const controller = new AbortController();
      const timer = setTimeout(() => controller.abort(), timeoutMs);
      let response: Response;
      try {
        response = await fetchImpl(BREVO_URL, {
          method: 'POST',
          headers: { 'api-key': apiKey, 'content-type': 'application/json', accept: 'application/json' },
          body: JSON.stringify({ sender: { email: senderEmail, name: senderName }, to: [{ email: to }], subject, textContent: text, htmlContent: html }),
          signal: controller.signal,
        });
      } catch (error) {
        // Si el error de red repitiera la clave, no sale en el mensaje.
        const reason = controller.signal.aborted ? `sin respuesta en ${timeoutMs} ms` : error instanceof Error ? error.message : String(error);
        throw new EmailSendError(`No se pudo llamar a Brevo: ${reason.split(apiKey).join('***')}`);
      } finally {
        clearTimeout(timer);
      }
      if (!response.ok) throw new EmailSendError(`Brevo respondió ${response.status}`);
    },
  };
}
