import { JWT } from "google-auth-library";
import { crearGoogleAuthJwt, conReintentosGoogleLectura } from "@/src/integrations/google";
import { normalizarCodigoMeet } from "../../domain/meet-attendance-summary.domain";

import type {
  ParametroAuditoriaMeet,
  EventoAuditoriaMeet,
  CorreoAuditadoMeet
} from "../../domain/archivos.types";

export type { EventoAuditoriaMeet, CorreoAuditadoMeet };

export function filtrarEventosAuditoriaConferencia(
  eventos: readonly EventoAuditoriaMeet[],
  inicio: string,
  fin: string
): Readonly<{
  eventosSolapados: readonly EventoAuditoriaMeet[];
  eventosAtribuibles: readonly EventoAuditoriaMeet[];
}> {
  const desde = Date.parse(inicio),
    hasta = Date.parse(fin);
  const eventosSolapados = eventos.filter((event) => {
    const salida = Date.parse(event.timestamp);
    const entrada = salida - event.durationSeconds * 1000;
    return (
      Number.isFinite(desde) &&
      Number.isFinite(hasta) &&
      Number.isFinite(entrada) &&
      Number.isFinite(salida) &&
      salida > desde &&
      entrada < hasta
    );
  });
  const ids = new Set(eventosSolapados.map((event) => event.conferenceId).filter(Boolean));
  return { eventosSolapados, eventosAtribuibles: ids.size === 1 ? eventosSolapados : [] };
}
type Actividad = {
  id?: { time?: string };
  events?: Array<{ name: string; parameters?: ParametroAuditoriaMeet[] }>;
};
type Pagina = { items?: Actividad[]; nextPageToken?: string };

export async function obtenerEventosAuditoriaMeet(input: {
  serviceAccountEmail: string;
  privateKey: string;
  adminEmail: string;
  meetingCode: string;
  startTime: string;
  endTime: string;
}): Promise<readonly EventoAuditoriaMeet[]> {
  const start = new Date(input.startTime),
    end = new Date(input.endTime);
  if (!Number.isFinite(start.getTime()) || !Number.isFinite(end.getTime()) || start >= end) {
    throw new Error("Intervalo de auditoría inválido");
  }
  const auth: JWT = crearGoogleAuthJwt(
    {
      serviceAccountEmail: input.serviceAccountEmail,
      privateKey: input.privateKey,
      subject: input.adminEmail
    },
    ["https://www.googleapis.com/auth/admin.reports.audit.readonly"]
  );
  const code = normalizarCodigoMeet(input.meetingCode);
  const result: EventoAuditoriaMeet[] = [];
  let token: string | undefined;
  do {
    const params = new URLSearchParams({
      eventName: "call_ended",
      startTime: start.toISOString(),
      endTime: end.toISOString(),
      maxResults: "1000"
    });
    if (token) {
      params.set("pageToken", token);
    }
    const response = await conReintentosGoogleLectura(() =>
      auth.request<Pagina>({
        url: `https://admin.googleapis.com/admin/reports/v1/activity/users/all/applications/meet?${params}`,
        method: "GET",
        timeout: 20_000
      })
    );
    for (const item of response.data.items ?? []) {
      for (const event of item.events ?? []) {
        if (event.name !== "call_ended") {
          continue;
        }
        const parameters = event.parameters ?? [];
        const p = new Map(parameters.map((v) => [v.name, v]));
        const value = (key: string) => p.get(key)?.value ?? p.get(key)?.intValue ?? "";
        const meetingCode = String(value("meeting_code"));
        if (normalizarCodigoMeet(meetingCode) !== code) {
          continue;
        }
        result.push({
          conferenceId: String(value("conference_id")),
          endpointId: String(value("endpoint_id")),
          meetingCode,
          identifier: String(value("identifier")),
          identifierType: String(value("identifier_type")),
          displayName: String(value("display_name")),
          timestamp: item.id?.time ?? "",
          durationSeconds: Math.max(0, Number(value("duration_seconds")) || 0),
          parameters
        });
      }
    }
    token = response.data.nextPageToken || undefined;
  } while (token);
  return result;
}

export async function obtenerCorreosAuditoriaMeet(
  input: Parameters<typeof obtenerEventosAuditoriaMeet>[0]
): Promise<readonly CorreoAuditadoMeet[]> {
  return agruparCorreosAuditoriaMeet(await obtenerEventosAuditoriaMeet(input));
}

export function agruparCorreosAuditoriaMeet(
  eventos: readonly EventoAuditoriaMeet[]
): readonly CorreoAuditadoMeet[] {
  const agrupados = new Map<string, CorreoAuditadoMeet>();
  for (const event of eventos) {
    if (event.identifierType !== "email_address") {
      continue;
    }
    const correo = event.identifier.trim().toLowerCase();
    if (
      !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(correo) ||
      !event.conferenceId ||
      !Number.isFinite(Date.parse(event.timestamp))
    ) {
      continue;
    }
    const key = `${event.conferenceId}|${correo}`;
    const previous = agrupados.get(key);
    const inicio = new Date(Date.parse(event.timestamp) - event.durationSeconds * 1000).toISOString();
    const session = {
      inicio,
      fin: event.timestamp,
      duracionSegundos: event.durationSeconds,
      nombre: event.displayName,
      identificador: event.identifier,
      endpointId: event.endpointId,
      meetingCode: event.meetingCode,
      identifierType: event.identifierType,
      timestamp: event.timestamp,
      parameters: event.parameters
    };
    const external = event.parameters.find((p) => p.name === "is_external")?.boolValue;
    agrupados.set(key, {
      correo,
      conferenciaId: event.conferenceId,
      externo: typeof external === "boolean" ? external : (previous?.externo ?? null),
      nombre: event.displayName || previous?.nombre,
      salida: event.timestamp,
      conexiones: [...(previous?.conexiones ?? []), session]
    });
  }
  return [...agrupados.values()].sort(
    (a, b) => a.conferenciaId.localeCompare(b.conferenciaId) || a.correo.localeCompare(b.correo)
  );
}
