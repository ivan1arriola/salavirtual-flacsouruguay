import { NextResponse } from "next/server";
import { z } from "zod";
import { auth } from "@/auth";
import { resolveSessionActor } from "@/src/lib/auth/session-actor.adapter";
import { db } from "@/src/lib/db";
import { enviarCorreoConfigurado } from "@/src/modules/configuracion/correo.service";
import { mensajeErrorGoogleWorkspace } from "@/src/modules/configuracion/google-workspace.domain";

export const runtime = "nodejs";

const testEmailSchema = z.object({
  destinatario: z.email("Ingresá un correo electrónico válido.")
});

export async function POST(request: Request) {
  const session = await auth();
  if (!session?.user || session.user.role !== "ADMINISTRACION") {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  try {
    const actor = await resolveSessionActor(db, {
      id: session.user.id,
      email: session.user.email
    });
    if (!actor?.activo || actor.rol !== "ADMINISTRACION") {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }

    const { destinatario } = testEmailSchema.parse(await request.json().catch(() => null));
    const sentAt = new Intl.DateTimeFormat("es-UY", {
      timeZone: "America/Montevideo",
      dateStyle: "full",
      timeStyle: "long"
    }).format(new Date());
    const result = await enviarCorreoConfigurado(db, {
      to: [destinatario],
      subject: "Prueba de correo · Sala Virtual FLACSO",
      text: [
        "Este es un correo de prueba enviado desde Sala Virtual FLACSO.",
        "",
        `Solicitado por: ${session.user.email ?? actor.id}`,
        `Fecha: ${sentAt}`,
        "",
        "Si recibiste este mensaje, el envío de invitaciones y notificaciones por correo está funcionando."
      ].join("\n")
    });
    if (!result.sent) {
      const message = result.skipped === "correo-no-configurado"
        ? "El correo no está configurado. Activá Amazon SES o configurá Gmail API o SMTP."
        : "No se pudo enviar el correo de prueba.";
      return NextResponse.json({ error: message }, { status: 400 });
    }

    const transport = result.transport === "AMAZON_SES" ? "Amazon SES" : result.transport === "GMAIL_API" ? "Gmail API" : "SMTP";
    return NextResponse.json({
      message: `Correo enviado a ${destinatario} mediante ${transport}. Revisá también la carpeta de spam.`
    });
  } catch (error) {
    const message = error instanceof z.ZodError
      ? error.issues[0]?.message ?? "Destinatario inválido."
      : error instanceof Error
        ? `No se pudo enviar el correo: ${mensajeErrorCorreo(error)}`
        : "No se pudo enviar el correo de prueba.";
    return NextResponse.json({ error: message }, { status: 400 });
  }
}

function mensajeErrorCorreo(error: Error): string {
  const code = error.name;
  if (code === 'AccessDeniedException' || code === 'AccessDenied') return 'el rol IAM de EC2 no tiene permiso ses:SendEmail para esta identidad.';
  if (code === 'MessageRejected') return 'Amazon SES rechazó el mensaje. Verificá el remitente, la región y el estado sandbox.';
  if (code.includes('CredentialsProvider') || code.includes('Credentials')) return 'no se encontraron credenciales del rol IAM de EC2.';
  return mensajeErrorGoogleWorkspace(error);
}
