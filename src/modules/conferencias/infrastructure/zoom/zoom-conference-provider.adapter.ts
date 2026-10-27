import {
  actualizarAlternativeHostsZoom,
  actualizarReunionZoom,
  crearReunionZoom,
  crearZoomClient,
  eliminarReunionZoom,
  esRecursoZoomInexistente,
  listarUsuariosZoomActivos,
  obtenerReunionZoom,
  type ZoomClientOptions,
  type ZoomMeeting,
  type ZoomMeetingInput,
} from "@/src/integrations/zoom";
import { normalizeCohostEmails, type ConferenceProvisionRequest, type ConferenceProvisionResult } from "../../domain";
import type {
  ZoomConferenceProvider,
  ZoomConferenceProviderFactory,
  ZoomProviderCredentials,
} from "../../ports";

/**
 * Zoom solo acepta como alternative host a usuarios activos de la misma
 * cuenta. Los demás cohosts quedan como "pendientes" en Sala Virtual y deben
 * promoverse a coanfitrión dentro de la reunión.
 */
export function separarAlternativeHosts(
  deseados: readonly string[],
  hostEmail: string,
  usuariosCuenta: readonly string[]
): Readonly<{ aplicados: readonly string[]; rechazados: readonly string[] }> {
  const host = hostEmail.trim().toLowerCase();
  const cuenta = new Set(usuariosCuenta.map((email) => email.trim().toLowerCase()));
  const candidatos = normalizeCohostEmails(deseados).filter((email) => email !== host);
  return {
    aplicados: candidatos.filter((email) => cuenta.has(email)),
    rechazados: candidatos.filter((email) => !cuenta.has(email)),
  };
}

export function resultadoDesdeReunionZoom(meeting: ZoomMeeting): ConferenceProvisionResult {
  return {
    externalEventId: String(meeting.id),
    codigoReunion: String(meeting.id),
    joinUrl: meeting.join_url,
    payload: {
      zoom: {
        id: meeting.id,
        uuid: meeting.uuid ?? null,
        hostEmail: meeting.host_email ?? null,
        startTime: meeting.start_time ?? null,
        duration: meeting.duration ?? null,
        timezone: meeting.timezone ?? null,
        status: meeting.status ?? null,
        alternativeHosts: (meeting.settings?.alternative_hosts ?? "")
          .split(/[;,]/)
          .map((email) => email.trim().toLowerCase())
          .filter(Boolean),
        autoRecording: meeting.settings?.auto_recording ?? null,
      },
    },
  };
}

function entradaReunion(
  request: ConferenceProvisionRequest,
  alternativeHosts: readonly string[]
): ZoomMeetingInput {
  return {
    topic: request.titulo,
    agenda: request.descripcion,
    inicio: request.inicio,
    fin: request.fin,
    timezone: request.timezone,
    alternativeHosts,
    grabarEnNube: Boolean(request.requiereGrabacion),
  };
}

export function crearZoomConferenceProvider(
  credentials: ZoomProviderCredentials,
  options: ZoomClientOptions = {}
): ZoomConferenceProvider {
  const client = crearZoomClient(credentials, options);
  let usuariosCache: Promise<readonly string[]> | null = null;
  const usuariosCuenta = () => {
    usuariosCache ??= listarUsuariosZoomActivos(client).then((users) =>
      users.map(({ email }) => email.toLowerCase())
    );
    return usuariosCache;
  };

  return {
    async crearReunion(hostEmail, request) {
      // Se crea sin alternative hosts: un correo inválido haría fallar el POST
      // completo. Los cohosts se aplican en el paso de configuración.
      const meeting = await crearReunionZoom(client, hostEmail, entradaReunion(request, []));
      return { externalEventId: String(meeting.id), payload: resultadoDesdeReunionZoom(meeting).payload };
    },

    async obtenerReunion(externalEventId) {
      try {
        return resultadoDesdeReunionZoom(await obtenerReunionZoom(client, externalEventId));
      } catch (error) {
        if (esRecursoZoomInexistente(error)) return null;
        throw error;
      }
    },

    async actualizarReunion(externalEventId, request) {
      const actual = await obtenerReunionZoom(client, externalEventId);
      const alternativeHosts = (actual.settings?.alternative_hosts ?? "")
        .split(/[;,]/).map((email) => email.trim()).filter(Boolean);
      await actualizarReunionZoom(client, externalEventId, entradaReunion(request, alternativeHosts));
    },

    async configurarCohosts(externalEventId, hostEmail, cohostEmails) {
      const separados = separarAlternativeHosts(cohostEmails, hostEmail, await usuariosCuenta());
      await actualizarAlternativeHostsZoom(client, externalEventId, separados.aplicados);
      return separados;
    },

    async cancelarReunion(externalEventId) {
      try {
        await eliminarReunionZoom(client, externalEventId);
      } catch (error) {
        if (!esRecursoZoomInexistente(error)) throw error;
      }
    },
  };
}

export const crearZoomConferenceProviderFactory: ZoomConferenceProviderFactory = (credentials) =>
  crearZoomConferenceProvider(credentials);
