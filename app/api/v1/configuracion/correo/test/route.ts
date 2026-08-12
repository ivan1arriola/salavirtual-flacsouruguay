import { NextResponse } from "next/server";
import { z } from "zod";
import { auth } from "@/auth";
import { resolveSessionActor } from "@/src/lib/auth/session-actor.adapter";
import { db } from "@/src/lib/db";
import { sendMail } from "@/src/lib/email.client";

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
    const result = await sendMail({
      to: [destinatario],
      subject: "Prueba de correo · Gestor FLACSO Meet",
      text: [
        "Este es un correo de prueba enviado desde el Gestor FLACSO Meet.",
        "",
        `Solicitado por: ${session.user.email ?? actor.id}`,
        `Fecha: ${sentAt}`,
        "",
        "Si recibiste este mensaje, el envío de invitaciones y notificaciones por correo está funcionando."
      ].join("\n")
    });
    if (!result.sent) {
      const message = result.skipped === "correo-no-configurado"
        ? "El correo no está configurado. Configurá Gmail API o las variables SMTP del servidor."
        : "No se pudo enviar el correo de prueba.";
      return NextResponse.json({ error: message }, { status: 400 });
    }

    const transport = result.transport === "GMAIL_API" ? "Gmail API" : "SMTP";
    return NextResponse.json({
      message: `Correo enviado a ${destinatario} mediante ${transport}. Revisá también la carpeta de spam.`
    });
  } catch (error) {
    const message = error instanceof z.ZodError
      ? error.issues[0]?.message ?? "Destinatario inválido."
      : error instanceof Error
        ? `No se pudo enviar el correo: ${error.message}`
        : "No se pudo enviar el correo de prueba.";
    return NextResponse.json({ error: message }, { status: 400 });
  }
}
