import "server-only";
import { db } from "@/src/lib/db";
import { descifrarConfiguracion } from "@/src/lib/config/encryption";
import { crearGoogleCalendarAuthClient } from "@/src/integrations/google/auth";
import { actualizarEventoCalendarHttp, obtenerEventoCalendar } from "@/src/integrations/google/calendar";
import { obtenerReunionZoomHttp, obtenerZoomAccessToken } from "@/src/integrations/zoom/zoom-client";
import { obtenerCredencialPrincipalGoogleWorkspace } from "@/src/modules/configuracion/api";
import { obtenerCredencialesZoom } from "@/src/modules/configuracion/zoom-config.service";
import { enviarCorreoConfigurado } from "@/src/modules/configuracion/correo.service";
import { obtenerServicioConferencias } from "@/src/bootstrap/conferencias.server";
import type { DependenciasMigracionZoom } from "@/src/modules/reuniones/migracion-zoom-aplicar.service";

async function calendarAuth(calendarId: string) {
  const cred = await obtenerCredencialPrincipalGoogleWorkspace(db, descifrarConfiguracion);
  if (!cred) throw new Error("Credenciales de Google Workspace no configuradas.");
  // El evento vive en el calendario del organizador Meet: se actúa como ese usuario.
  return crearGoogleCalendarAuthClient({
    serviceAccountEmail: cred.serviceAccountEmail,
    privateKey: cred.privateKey,
    subject: calendarId,
  });
}

export function crearDependenciasMigracionZoom(): DependenciasMigracionZoom {
  return {
    db,
    enviarCorreo: (input) => enviarCorreoConfigurado(db, input),
    sincronizarEventos: (ids) => obtenerServicioConferencias().sincronizarEventosPendientes(ids),
    async verificarReunionZoom(meetingId) {
      const creds = await obtenerCredencialesZoom(db, descifrarConfiguracion);
      if (!creds.disponible) throw new Error(creds.error || "Credenciales de Zoom no configuradas.");
      const token = await obtenerZoomAccessToken({
        accountId: creds.accountId,
        clientId: creds.clientId,
        clientSecret: creds.clientSecret,
      });
      const { joinUrl } = await obtenerReunionZoomHttp(token, meetingId);
      return { joinUrl };
    },
    calendar: {
      async obtener({ calendarId, eventId }) {
        return obtenerEventoCalendar(await calendarAuth(calendarId), calendarId, eventId, { conferenceDataVersion: 1 });
      },
      async actualizar({ calendarId, eventId, cambio }) {
        // Sin avisos de Google: los correos individuales se envían desde Sala Virtual,
        // deduplicados, una vez cambiado el proveedor activo.
        await actualizarEventoCalendarHttp(await calendarAuth(calendarId), calendarId, eventId, cambio, {
          conferenceDataVersion: 1,
          sendUpdates: "none",
        });
      },
    },
  };
}
