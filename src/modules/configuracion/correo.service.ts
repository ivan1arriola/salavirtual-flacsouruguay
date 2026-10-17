import {
  crearCompositeEmailTransport,
  crearGmailEmailTransport,
  crearSmtpEmailTransport,
  type MailInput,
  type MailSendResult,
} from "@/src/modules/notificaciones/api";
import { descifrarConfiguracion } from "../../lib/config/encryption";
import {
  obtenerCredencialPrincipalGoogleWorkspace,
  type WorkspaceConfigDb,
} from "./google-workspace.service";

export async function enviarCorreoConfigurado(
  db: WorkspaceConfigDb,
  input: MailInput
): Promise<MailSendResult> {
  const gmailTransport = crearGmailEmailTransport(async () => {
    const cred = await obtenerCredencialPrincipalGoogleWorkspace(db, descifrarConfiguracion, { requireActiva: true });
    if (!cred?.serviceAccountSubject) return null;
    return {
      serviceAccountEmail: cred.serviceAccountEmail,
      privateKey: cred.privateKey,
      subject: cred.serviceAccountSubject,
    };
  });

  const smtpTransport = crearSmtpEmailTransport();
  const transport = crearCompositeEmailTransport(gmailTransport, smtpTransport);

  return transport.enviarCorreo(input);
}
