import "server-only";
import type { Prisma } from "@prisma/client";
import { OAuth2Client } from "google-auth-library";
import { authConfig } from "@/src/lib/auth/config";
import { cifrarConfiguracion, descifrarConfiguracion } from "@/src/lib/config/encryption";
import { db } from "@/src/lib/db";
import {
  eventoCoberturaZoom,
  type EventoCoberturaZoom
} from "@/src/modules/asistencia/domain/calendario-zoom.domain";

const scope = "https://www.googleapis.com/auth/calendar.app.created";
const googleApi = "https://www.googleapis.com/calendar/v3/calendars";
export const rutaCalendarioZoom = "/api/v1/asistencia/calendario-zoom";

export function configurarOAuthCalendarioZoom(): OAuth2Client | null {
  const clientId = process.env.ASISTENCIA_CALENDAR_GOOGLE_ID;
  const clientSecret = process.env.ASISTENCIA_CALENDAR_GOOGLE_SECRET;
  if (!clientId || !clientSecret) {
    return null;
  }
  return new OAuth2Client(clientId, clientSecret, new URL(rutaCalendarioZoom, authConfig.baseUrl).href);
}

export function scopesCalendarioZoom(): string[] {
  return ["openid", "email", scope];
}

function destinoCalendario(calendarId: string): string {
  return `${googleApi}/${encodeURIComponent(calendarId)}`;
}

function esErrorGoogle(error: unknown, status: number): boolean {
  return (error as { response?: { status?: number } } | null)?.response?.status === status;
}

function permisoRevocado(error: unknown): boolean {
  const respuesta = (error as { response?: { data?: { error?: string } } } | null)?.response;
  return respuesta?.data?.error === "invalid_grant";
}

async function eliminarRecurso(client: OAuth2Client, url: string) {
  try {
    await client.request({ url, method: "DELETE", timeout: 5000 });
  } catch (error) {
    if (!esErrorGoogle(error, 404) && !esErrorGoogle(error, 410)) {
      throw error;
    }
  }
}

async function conBloqueo<T>(
  asistenteId: string,
  ejecutar: (tx: Prisma.TransactionClient) => Promise<T>
): Promise<T | null> {
  return db.$transaction(
    async (tx) => {
      const [resultado] = await tx.$queryRaw<{ adquirido: boolean }[]>`
        SELECT pg_try_advisory_xact_lock(hashtextextended(${"calendario-zoom:" + asistenteId}, 0)) AS adquirido
      `;
      return resultado?.adquirido ? ejecutar(tx) : null;
    },
    { timeout: 45_000 }
  );
}

export async function conectarCalendarioZoom(
  asistenteId: string,
  client: OAuth2Client,
  code: string,
  codeVerifier: string
) {
  const { tokens } = await client.getToken({ code, codeVerifier });
  const clientId = process.env.ASISTENCIA_CALENDAR_GOOGLE_ID;
  if (!clientId || !tokens.id_token || !tokens.refresh_token || !tokens.scope?.split(" ").includes(scope)) {
    return false;
  }
  const idToken = await client.verifyIdToken({ idToken: tokens.id_token, audience: clientId });
  const identidad = idToken.getPayload();
  if (!identidad?.email_verified || !identidad.email) {
    return false;
  }
  const email = identidad.email;
  const tokenCifrado = cifrarConfiguracion(tokens.refresh_token);
  client.setCredentials(tokens);

  return conBloqueo(asistenteId, async (tx) => {
    const existente = await tx.calendarioZoomAsistente.findUnique({ where: { asistenteId } });
    if (existente) {
      return false;
    }
    await crearCalendario(tx, asistenteId, client, email, tokenCifrado);
    return true;
  });
}

async function crearCalendario(
  tx: Prisma.TransactionClient,
  asistenteId: string,
  client: OAuth2Client,
  email: string,
  tokenCifrado: string
) {
  const { data } = await client.request<{ id: string }>({
    url: googleApi,
    method: "POST",
    data: { summary: "Sala Virtual FLACSO · Coberturas Zoom", timeZone: "America/Montevideo" },
    timeout: 5000,
    retry: false
  });
  try {
    await tx.calendarioZoomAsistente.create({
      data: { asistenteId, calendarId: data.id, email, tokenCifrado }
    });
  } catch (error) {
    await eliminarRecurso(client, destinoCalendario(data.id)).catch(() => undefined);
    throw error;
  }
}

export async function desconectarCalendarioZoom(asistenteId: string, client: OAuth2Client) {
  return conBloqueo(asistenteId, async (tx) => {
    const conexion = await tx.calendarioZoomAsistente.findUnique({ where: { asistenteId } });
    if (!conexion) {
      return "desconectado";
    }
    client.setCredentials({ refresh_token: descifrarConfiguracion(conexion.tokenCifrado) });
    let estado = "desconectado";
    try {
      await eliminarRecurso(client, destinoCalendario(conexion.calendarId));
    } catch (error) {
      if (!permisoRevocado(error)) {
        throw error;
      }
      estado = "desconectado-revocado";
    }
    await tx.calendarioZoomAsistente.delete({ where: { asistenteId } });
    return estado;
  });
}

type EventoPublicado = {
  id: string;
  extendedProperties?: { private?: { flacsoClave?: string; flacsoHuella?: string } };
};

async function obtenerEventosPublicados(client: OAuth2Client, url: string, ahora: Date) {
  const publicados: EventoPublicado[] = [];
  let pageToken: string | undefined;
  do {
    const { data } = await client.request<{ items?: EventoPublicado[]; nextPageToken?: string }>({
      url,
      params: { timeMin: ahora.toISOString(), privateExtendedProperty: "flacsoCoberturaZoom=1", pageToken },
      timeout: 5000
    });
    publicados.push(...(data.items ?? []));
    pageToken = data.nextPageToken;
  } while (pageToken);
  return publicados;
}

async function actualizarEvento(client: OAuth2Client, url: string, id: string, evento: EventoCoberturaZoom) {
  const { id: _id, ...data } = evento;
  await client.request({ url: `${url}/${encodeURIComponent(id)}`, method: "PATCH", data, timeout: 5000 });
}

async function publicarEvento(client: OAuth2Client, url: string, evento: EventoCoberturaZoom) {
  for (let intento = 0; intento < 20; intento++) {
    const id = intento === 0 ? evento.id : `${evento.id}${intento.toString(16)}`;
    try {
      await client.request({ url, method: "POST", data: { ...evento, id }, timeout: 5000, retry: false });
      return;
    } catch (error) {
      if (!esErrorGoogle(error, 409)) {
        throw error;
      }
    }
    try {
      await actualizarEvento(client, url, id, evento);
      return;
    } catch (error) {
      // Google puede reservar el ID después de eliminar una cita.
      if (!esErrorGoogle(error, 404) && !esErrorGoogle(error, 410)) {
        throw error;
      }
    }
  }
  throw new Error("Google Calendar agotó las variantes de ID para esta cobertura.");
}

async function obtenerEventosDeseados(tx: Prisma.TransactionClient, asistenteId: string, ahora: Date) {
  const asignaciones = await tx.asignacionAsistenciaTecnica.findMany({
    where: {
      asistenteTecnicoId: asistenteId,
      estado: { in: ["ASIGNADO", "ACEPTADO"] },
      asistenteTecnico: { usuario: { activo: true, rol: "ASISTENTE_TECNICO", fusionadoEnId: null } },
      instancia: {
        estado: "PROGRAMADA",
        OR: [
          { finAsistenciaTecnicaAt: { gt: ahora } },
          { finAsistenciaTecnicaAt: null, finProgramadoAt: { gt: ahora } }
        ]
      }
    },
    select: {
      instancia: {
        select: {
          id: true,
          inicioProgramadoAt: true,
          finProgramadoAt: true,
          inicioAsistenciaTecnicaAt: true,
          finAsistenciaTecnicaAt: true,
          modalidadOverride: true,
          proveedorActivoTipo: true,
          eventosProveedor: { select: { proveedor: { select: { tipo: true } } } },
          solicitud: { select: { titulo: true, modalidad: true } }
        }
      }
    }
  });
  return asignaciones.flatMap(({ instancia }) => {
    const evento = eventoCoberturaZoom(instancia, authConfig.baseUrl);
    return evento ? [evento] : [];
  });
}

async function conciliarEventos(
  client: OAuth2Client,
  url: string,
  eventos: EventoCoberturaZoom[],
  ahora: Date
) {
  const remotos = await obtenerEventosPublicados(client, url, ahora);
  const deseados = new Map(eventos.map((evento) => [evento.id, evento]));
  const publicados = new Map<string, EventoPublicado>();
  for (const remoto of remotos) {
    const clave = remoto.extendedProperties?.private?.flacsoClave ?? remoto.id;
    if (deseados.has(clave) && !publicados.has(clave)) {
      publicados.set(clave, remoto);
    } else {
      await eliminarRecurso(client, `${url}/${encodeURIComponent(remoto.id)}`);
    }
  }
  for (const evento of eventos) {
    const anterior = publicados.get(evento.id);
    if (!anterior) {
      await publicarEvento(client, url, evento);
    } else if (
      anterior.extendedProperties?.private?.flacsoHuella !== evento.extendedProperties.private.flacsoHuella
    ) {
      await actualizarEvento(client, url, anterior.id, evento);
    }
  }
}

export async function sincronizarCalendarioZoom(asistenteId: string, client: OAuth2Client) {
  return conBloqueo(asistenteId, async (tx) => {
    const conexion = await tx.calendarioZoomAsistente.findUnique({ where: { asistenteId } });
    if (!conexion) {
      return "sin-conexion";
    }
    const ahora = new Date();
    client.setCredentials({ refresh_token: descifrarConfiguracion(conexion.tokenCifrado) });
    const eventosUrl = `${destinoCalendario(conexion.calendarId)}/events`;
    const eventos = await obtenerEventosDeseados(tx, asistenteId, ahora);
    let estado = "sincronizado";
    try {
      await conciliarEventos(client, eventosUrl, eventos, ahora);
    } catch (error) {
      estado = permisoRevocado(error) ? "reconectar" : "error";
    }
    await tx.calendarioZoomAsistente.update({
      where: { asistenteId },
      data: { ultimoIntentoAt: ahora, error: estado === "sincronizado" ? null : estado }
    });
    return estado;
  });
}

export async function reconciliarCalendariosZoom(): Promise<number> {
  if (!configurarOAuthCalendarioZoom()) {
    return 0;
  }
  const conexiones = await db.calendarioZoomAsistente.findMany({
    where: { OR: [{ error: null }, { error: "error" }] },
    orderBy: [{ ultimoIntentoAt: { sort: "asc", nulls: "first" } }, { asistenteId: "asc" }],
    take: 10,
    select: { asistenteId: true }
  });
  const resultados = await Promise.allSettled(
    conexiones.map(({ asistenteId }) => {
      const cliente = configurarOAuthCalendarioZoom();
      return cliente ? sincronizarCalendarioZoom(asistenteId, cliente) : null;
    })
  );
  const fallos = resultados.filter(
    (resultado) => resultado.status === "rejected" || resultado.value === "error"
  );
  return fallos.length;
}
