import { NextResponse } from "next/server";
import { auth } from "@/auth";
import { resolveSessionActor } from "@/src/lib/auth/session-actor.adapter";
import { db } from "@/src/lib/db";
import { descifrarConfiguracion } from "@/src/lib/config/encryption";
import { obtenerCredencialPrincipalGoogleWorkspace } from "@/src/modules/configuracion/api";
import { enviarCorreoConfigurado } from "@/src/modules/configuracion/correo.service";
import { actualizarInvitadosSerie } from "@/src/modules/reuniones/invitados-serie.service";
import {
  obtenerEventoCalendar,
  actualizarEventoCalendarHttp,
} from "@/src/integrations/google/calendar";
import { crearGoogleCalendarAuthClient } from "@/src/integrations/google/auth";
import { toHttpError, IntegrationApiError } from "@/src/lib/http/api-error";

export const runtime = "nodejs";
type Context = Readonly<{ params: Promise<{ solicitudId: string }> }>;

export async function PUT(request: Request, context: Context) {
  const session = await auth();
  if (!session?.user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  try {
    const actor = await resolveSessionActor(db, { id: session.user.id, email: session.user.email });
    if (!actor?.activo) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
    const credencial = await obtenerCredencialPrincipalGoogleWorkspace(db, descifrarConfiguracion, {
      requireActiva: true,
    });
    if (!credencial) {
      throw new IntegrationApiError("Google Workspace no está configurado.", 503);
    }
    const authForHost = (subject: string) =>
      crearGoogleCalendarAuthClient({
        serviceAccountEmail: credencial.serviceAccountEmail,
        privateKey: credencial.privateKey,
        subject,
      });
    const result = await actualizarInvitadosSerie(
      {
        db,
        leerCalendario: async (host, eventId) => {
          const event = await obtenerEventoCalendar(authForHost(host), host, eventId);
          return { attendees: event.attendees ?? [] };
        },
        actualizarCalendario: async (host, eventId, attendees) => {
          await actualizarEventoCalendarHttp(
            authForHost(host),
            host,
            eventId,
            { attendees },
            { sendUpdates: "none" },
          );
        },
        enviarCorreo: async (to, message) => {
          const sent = await enviarCorreoConfigurado(db, { to: [to], ...message });
          return sent.sent;
        },
      },
      actor,
      (await context.params).solicitudId,
      await request.json().catch(() => null),
    );
    return NextResponse.json(result);
  } catch (error) {
    const mapped = toHttpError(error);
    return NextResponse.json({ error: mapped.message }, { status: mapped.status });
  }
}
