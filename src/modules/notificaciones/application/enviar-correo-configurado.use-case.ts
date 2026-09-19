import type { MailInput, MailSendResult } from "../domain";
import type { EmailTransportPort } from "../ports";

export async function enviarCorreoConfiguradoUseCase(
  emailTransport: EmailTransportPort,
  input: MailInput
): Promise<MailSendResult> {
  return emailTransport.enviarCorreo(input);
}

