import { createHash } from "node:crypto";
import type { PrismaClient } from "@prisma/client";
import { normalizeCohostEmails } from "./cohosts.domain";
import { extraerConferenceData } from "./google-calendar.domain";
import type { GoogleCalendarCredentials } from "./google-calendar.adapter";
import type { MeetProvider, MeetProvisionRequest, MeetProvisionResult } from "./provider";
import { bloquearEventoProveedor } from "../reuniones/reserva-salas.adapter";
import { recalcularSolicitud } from "../reuniones/encuentros-persistence.adapter";

export type ProvisionDependencies = Readonly<{ db: PrismaClient; descifrar: (value: string) => string; crearProvider: (credentials: GoogleCalendarCredentials) => MeetProvider }>;
export type ProvisionResult = Readonly<{ eventoProveedorId: string; estado: "SINCRONIZADA" | "ERROR" | "PENDIENTE_CONFIGURACION" | "EN_PROCESO"; codigoReunion?: string; error?: string }>;

export async function provisionarEventosMeet(dependencies: ProvisionDependencies, ids: readonly string[]): Promise<readonly ProvisionResult[]> {
  return sincronizarEventosPendientes(dependencies, ids);
}

/** Executes the persisted operation, never guessing it from an error message. */
export async function sincronizarEventosPendientes(dependencies: ProvisionDependencies, ids: readonly string[]): Promise<readonly ProvisionResult[]> {
  const config = await dependencies.db.configuracionGoogleWorkspace.findUnique({ where: { id: "principal", activa: true } });
  if (!config?.serviceAccountEmail || !config.privateKeyCifrada) return ids.map((eventoProveedorId) => ({ eventoProveedorId, estado: "PENDIENTE_CONFIGURACION" }));
  let privateKey: string;
  try { privateKey = dependencies.descifrar(config.privateKeyCifrada); }
  catch (error) { return Promise.all(ids.map((id) => registrarError(dependencies.db, id, mensaje(error, "No se pudo leer la clave de Google.")))); }
  const results: ProvisionResult[] = [];
  for (const id of [...new Set(ids)]) {
    const event = await reclamarEvento(dependencies.db, id);
    if (!event) { results.push({ eventoProveedorId: id, estado: "EN_PROCESO" }); continue; }
    const hostEmail = event.cuentaProveedor?.emailOrganizador;
    if (!hostEmail) { results.push(await registrarError(dependencies.db, id, "La cuenta host no tiene email organizador.")); continue; }
    const provider = dependencies.crearProvider({ serviceAccountEmail: config.serviceAccountEmail, privateKey, subject: hostEmail });
    try {
      const request = solicitudProvider(event);
      let result: MeetProvisionResult | null = null;
      if (event.operacionPendiente === "PROVISIONAR") result = await provisionar(provider, dependencies.db, event, request);
      else if (event.operacionPendiente === "REPROGRAMAR") {
        if (!event.externalEventId) throw new Error("No existe un evento Calendar para reprogramar.");
        await provider.actualizarEvento(hostEmail, event.externalEventId, request);
        result = await provider.obtenerEvento(hostEmail, event.externalEventId);
      } else if (event.operacionPendiente === "CONFIGURAR_MEET") {
        if (!event.externalEventId) throw new Error("No existe un evento Calendar para configurar Meet.");
        result = await obtenerConReintentos(provider, hostEmail, event.externalEventId);
        if (!result) throw new Error("Google Calendar todavía no confirmó el enlace Meet.");
        await provider.configurarEventoMeet(request, result);
      } else if (event.operacionPendiente === "CANCELAR") {
        if (event.externalEventId) {
          try { await provider.cancelarEvento(hostEmail, event.externalEventId); }
          catch (error) { if (!esEventoInexistente(error)) throw error; }
        }
        await finalizarCancelacion(dependencies.db, event.id);
        results.push({ eventoProveedorId: event.id, estado: "SINCRONIZADA" });
        continue;
      } else { results.push({ eventoProveedorId: id, estado: "EN_PROCESO" }); continue; }
      await finalizarSincronizacion(dependencies.db, event.id, result);
      results.push({ eventoProveedorId: event.id, estado: "SINCRONIZADA", codigoReunion: result?.codigoReunion });
    } catch (error) { results.push(await registrarError(dependencies.db, event.id, mensaje(error, "Error desconocido de Google."))); }
  }
  return results;
}

async function reclamarEvento(db: PrismaClient, id: string) {
  return db.$transaction(async (tx) => {
    await bloquearEventoProveedor(tx, id);
    const event = await tx.eventoProveedor.findUnique({ where: { id }, include: { cuentaProveedor: true, instancia: { include: { solicitud: true, cohosts: { include: { cuentaGoogle: { select: { email: true } } } }, cohostEmails: true } } } });
    if (!event?.operacionPendiente || (event.reclamoIntegracionAt && event.reclamoIntegracionAt > new Date(Date.now() - 10 * 60_000))) return null;
    await tx.eventoProveedor.update({ where: { id }, data: { reclamoIntegracionAt: new Date(), estadoIntegracion: "PENDIENTE" } });
    return event;
  });
}

type EventoReclamado = NonNullable<Awaited<ReturnType<typeof reclamarEvento>>>;

async function provisionar(provider: MeetProvider, db: PrismaClient, event: EventoReclamado, request: MeetProvisionRequest): Promise<MeetProvisionResult> {
  let externalEventId = event.externalEventId;
  if (!externalEventId) {
    const shared = await db.eventoProveedor.findFirst({ where: { id: { not: event.id }, instancia: { solicitudSalaId: event.instancia.solicitudSalaId }, estadoIntegracion: "SINCRONIZADA" }, orderBy: { updatedAt: "asc" }, select: { payloadUltimo: true } });
    const created = await provider.crearEventoCalendar({ ...request, conferenceData: extraerConferenceData(shared?.payloadUltimo) });
    externalEventId = created.externalEventId;
    await db.eventoProveedor.update({ where: { id: event.id }, data: { externalEventId, payloadUltimo: JSON.parse(JSON.stringify(created.payload)), errorIntegracion: null } });
  }
  const result = await obtenerConReintentos(provider, request.calendarId, externalEventId);
  if (!result) throw new Error("Google Calendar todavía no terminó de generar el enlace Meet.");
  await provider.configurarEventoMeet(request, result);
  return result;
}

function solicitudProvider(event: EventoReclamado): MeetProvisionRequest {
  const { instancia } = event;
  return { titulo: instancia.solicitud.titulo, descripcion: instancia.descripcion ?? instancia.solicitud.descripcion ?? undefined, inicio: instancia.inicioProgramadoAt, fin: instancia.finProgramadoAt, timezone: instancia.timezone, calendarId: event.cuentaProveedor!.emailOrganizador!, cohostEmails: normalizeCohostEmails([...instancia.cohosts.map(({ cuentaGoogle }) => cuentaGoogle.email), ...instancia.cohostEmails.map(({ email }) => email)]), requiereAsistenciaTecnica: instancia.requiereAsistenciaTecnica, calendarEventId: calendarEventId(event.id) };
}

async function obtenerConReintentos(provider: MeetProvider, calendarId: string, id: string): Promise<MeetProvisionResult | null> {
  for (const delay of [0, 250, 500, 1000, 2000]) { if (delay) await new Promise((resolve) => setTimeout(resolve, delay)); const result = await provider.obtenerEvento(calendarId, id); if (result) return result; }
  return null;
}

async function finalizarSincronizacion(db: PrismaClient, id: string, result: MeetProvisionResult | null): Promise<void> {
  await db.$transaction(async (tx) => {
    const event = await tx.eventoProveedor.update({ where: { id }, data: { estadoIntegracion: "SINCRONIZADA", operacionPendiente: null, reclamoIntegracionAt: null, errorIntegracion: null, sincronizadoAt: new Date(), ...(result ? { externalEventId: result.externalEventId, codigoReunion: result.codigoReunion, joinUrl: result.joinUrl, payloadUltimo: JSON.parse(JSON.stringify(result.payload)) } : {}) }, select: { instancia: { select: { solicitudSalaId: true, estado: true } } } });
    if (event.instancia.estado !== "CANCELADA") await recalcularSolicitud(tx, event.instancia.solicitudSalaId);
  });
}
async function finalizarCancelacion(db: PrismaClient, id: string): Promise<void> { await db.eventoProveedor.update({ where: { id }, data: { estadoIntegracion: "SINCRONIZADA", operacionPendiente: null, reclamoIntegracionAt: null, errorIntegracion: null, sincronizadoAt: new Date() } }); }
async function registrarError(db: PrismaClient, id: string, error: string): Promise<ProvisionResult> { await db.eventoProveedor.update({ where: { id }, data: { estadoIntegracion: "ERROR", errorIntegracion: error, reclamoIntegracionAt: null } }); return { eventoProveedorId: id, estado: "ERROR", error }; }
function calendarEventId(id: string): string { return `a${createHash("sha256").update(id).digest("hex")}`; }
function mensaje(error: unknown, fallback: string): string { return error instanceof Error ? error.message : fallback; }
function esEventoInexistente(error: unknown): boolean { const value = error as { code?: unknown; status?: unknown; response?: { status?: unknown } }; return value?.code === 404 || value?.code === 410 || value?.status === 404 || value?.status === 410 || value?.response?.status === 404 || value?.response?.status === 410; }
