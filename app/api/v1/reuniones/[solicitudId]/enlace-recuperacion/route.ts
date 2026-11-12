import { NextResponse } from "next/server";
import { auth } from "@/auth";
import { resolveSessionActor } from "@/src/lib/auth/session-actor.adapter";
import { db } from "@/src/lib/db";
import { descifrarConfiguracion } from "@/src/lib/config/encryption";
import { obtenerCredencialPrincipalGoogleWorkspace } from "@/src/modules/configuracion/api";
import { enviarCorreoConfigurado } from "@/src/modules/configuracion/correo.service";
import {
  recuperarEnlaceSerie,
  descripcionConAccesoMeet
} from "@/src/modules/reuniones/recuperacion-enlace-serie.service";
import { obtenerEventoCalendar, actualizarEventoCalendarHttp } from "@/src/integrations/google/calendar";
import { crearGoogleCalendarAuthClient, crearGoogleMeetAuthClient } from "@/src/integrations/google/auth";
import { obtenerEspacioMeet } from "@/src/integrations/google/meet";
import { IntegrationApiError, ConflictApiError, toHttpError } from "@/src/lib/http/api-error";

export const runtime = "nodejs";
export const maxDuration = 300;
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
    const input = await request.json().catch(() => null);
    const meetUrl =
      input && typeof input === "object" && typeof input.meetUrl === "string" ? input.meetUrl : "";
    const cred = await obtenerCredencialPrincipalGoogleWorkspace(db, descifrarConfiguracion, {
      requireActiva: true
    });
    if (!cred) {
      throw new IntegrationApiError("No hay credenciales de Workspace activas.", 503);
    }

    function calendarAuth(host: string) {
      return crearGoogleCalendarAuthClient({
        serviceAccountEmail: cred!.serviceAccountEmail,
        privateKey: cred!.privateKey,
        subject: host
      });
    }
    const resultado = await recuperarEnlaceSerie(
      {
        db,
        comprobarMeet: async (host, code) => {
          const meetAuth = crearGoogleMeetAuthClient({
            serviceAccountEmail: cred.serviceAccountEmail,
            privateKey: cred.privateKey,
            subject: host
          });
          const space = await obtenerEspacioMeet(meetAuth, code);
          if (space.meetingCode !== code) {
            throw new ConflictApiError("Google no reconoció el enlace de Meet indicado.");
          }
        },
        leerCalendario: async (host, eventId) => {
          const evento = await obtenerEventoCalendar(calendarAuth(host), host, eventId, {
            conferenceDataVersion: 1
          });
          return {
            description: evento.description,
            location: typeof evento.location === "string" ? evento.location : undefined,
            hangoutLink: evento.hangoutLink,
            conferenceData: evento.conferenceData
          };
        },
        reemplazarEnCalendar: async (host, eventId, url, current) => {
          const updated = await actualizarEventoCalendarHttp(
            calendarAuth(host),
            host,
            eventId,
            {
              conferenceData: null as unknown as Record<string, unknown>,
              location: url,
              description: descripcionConAccesoMeet(current.description, url)
            },
            { conferenceDataVersion: 1, sendUpdates: "none" }
          );
          return {
            description: updated.description,
            location: typeof updated.location === "string" ? updated.location : undefined,
            hangoutLink: updated.hangoutLink,
            conferenceData: updated.conferenceData
          };
        },
        restaurarEnCalendar: async (host, eventId, previous) => {
          await actualizarEventoCalendarHttp(
            calendarAuth(host),
            host,
            eventId,
            {
              conferenceData: (previous.conferenceData ?? null) as Record<string, unknown>,
              location: previous.location ?? "",
              description: previous.description ?? ""
            },
            { conferenceDataVersion: 1, sendUpdates: "none" }
          );
        },
        enviarCorreo: async (to, mail) => {
          const result = await enviarCorreoConfigurado(db, { to: [to], ...mail });
          return result.sent;
        }
      },
      actor,
      (await context.params).solicitudId,
      meetUrl
    );
    return NextResponse.json(resultado);
  } catch (error) {
    const mapped = toHttpError(error);
    return NextResponse.json({ error: mapped.message }, { status: mapped.status });
  }
}
