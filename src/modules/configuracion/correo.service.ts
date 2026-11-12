import {
  crearCompositeEmailTransport,
  crearGmailEmailTransport,
  crearSesV2EmailTransport,
  crearSmtpEmailTransport,
  type MailInput,
  type MailSendResult
} from "@/src/modules/notificaciones/api";
import { descifrarConfiguracion } from "../../lib/config/encryption";
import { obtenerCredencialPrincipalGoogleWorkspace } from "./google-workspace.service";
import { obtenerConfiguracionCorreoSesActiva } from "./correo-ses.service";

export async function enviarCorreoConfigurado(db: PrismaClient, input: MailInput): Promise<MailSendResult> {
  const gmailTransport = crearGmailEmailTransport(async () => {
    const cred = await obtenerCredencialPrincipalGoogleWorkspace(db, descifrarConfiguracion, {
      requireActiva: true
    });
    if (!cred?.serviceAccountSubject) {
      return null;
    }
    return {
      serviceAccountEmail: cred.serviceAccountEmail,
      privateKey: cred.privateKey,
      subject: cred.serviceAccountSubject
    };
  });

  const smtpTransport = crearSmtpEmailTransport();
  const sesTransport = crearSesV2EmailTransport(() => obtenerConfiguracionCorreoSesActiva(db));
  const transport = crearCompositeEmailTransport(gmailTransport, smtpTransport, sesTransport);

  return transport.enviarCorreo(input);
}
import type { PrismaClient } from "@prisma/client";
