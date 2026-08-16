import { createHash } from "node:crypto";
import type { Prisma, PrismaClient } from "@prisma/client";
import { normalizeCohostEmails } from "./cohosts.domain";
import { extraerConferenceData } from "./google-calendar.domain";
import type { GoogleCalendarCredentials } from "./google-calendar.adapter";
import type { MeetProvider, MeetProvisionRequest, MeetProvisionResult } from "./provider";
import { bloquearEventoProveedor } from "../reuniones/reserva-salas.adapter";
import { recalcularSolicitud } from "../reuniones/encuentros-persistence.adapter";

const CLAIM_TIMEOUT_MS = 10 * 60_000;
type OperacionPendiente = "PROVISIONAR" | "REPROGRAMAR" | "CONFIGURAR_MEET" | "CANCELAR";

export type ProvisionDependencies = Readonly<{
  db: PrismaClient;
  descifrar: (value: string) => string;
  crearProvider: (credentials: GoogleCalendarCredentials) => MeetProvider;
}>;

export type ProvisionResult = Readonly<{
  eventoProveedorId: string;
  estado: "SINCRONIZADA" | "ERROR" | "PENDIENTE_CONFIGURACION" | "EN_PROCESO" | "REQUIERE_REVISION";
  codigoReunion?: string;
  error?: string;
}>;

export async function provisionarEventosMeet(
  dependencies: ProvisionDependencies,
  ids: readonly string[],
): Promise<readonly ProvisionResult[]> {
  return sincronizarEventosPendientes(dependencies, ids);
}

/**
 * Ejecuta solamente la operación persistida en EventoProveedor. Nunca infiere
 * trabajo a partir de errorIntegracion y nunca mantiene una transacción abierta
 * durante una llamada HTTP a Google.
 */
export async function sincronizarEventosPendientes(
  dependencies: ProvisionDependencies,
  ids: readonly string[],
): Promise<readonly ProvisionResult[]> {
  const uniqueIds = [...new Set(ids)];
  if (uniqueIds.length === 0) return [];

  const snapshots = await dependencies.db.eventoProveedor.findMany({
    where: { id: { in: uniqueIds }, proveedor: { tipo: "GOOGLE_MEET" } },
    select: {
      id: true,
      estadoIntegracion: true,
      operacionPendiente: true,
      reclamoIntegracionAt: true,
      errorIntegracion: true,
    },
  });
  const byId = new Map(snapshots.map((item) => [item.id, item]));
  const pendingIds = uniqueIds.filter((id) => byId.get(id)?.operacionPendiente);
  const settled = uniqueIds
    .filter((id) => !pendingIds.includes(id))
    .map((id): ProvisionResult => resultadoSinOperacion(id, byId.get(id)));

  if (pendingIds.length === 0) return settled;

  const config = await dependencies.db.configuracionGoogleWorkspace.findUnique({
    where: { id: "principal", activa: true },
  });
  if (!config?.serviceAccountEmail || !config.privateKeyCifrada) {
    return [
      ...settled,
      ...pendingIds.map((eventoProveedorId) => ({
        eventoProveedorId,
        estado: "PENDIENTE_CONFIGURACION" as const,
      })),
    ];
  }

  let privateKey: string;
  try {
    privateKey = dependencies.descifrar(config.privateKeyCifrada);
  } catch (error) {
    const detail = mensaje(error, "No se pudo leer la clave de Google.");
    const failed = await Promise.all(
      pendingIds.map((id) => registrarErrorSinClaim(dependencies.db, id, detail)),
    );
    return [...settled, ...failed];
  }

  const results: ProvisionResult[] = [...settled];
  for (const id of pendingIds) {
    const claim = await reclamarEvento(dependencies.db, id);
    if (!claim) {
      results.push(await estadoActual(dependencies.db, id));
      continue;
    }

    const hostEmail = claim.event.cuentaProveedor?.emailOrganizador;
    if (!hostEmail) {
      results.push(await registrarErrorReclamado(
        dependencies.db,
        claim,
        "La cuenta host no tiene email organizador.",
      ));
      continue;
    }

    const provider = dependencies.crearProvider({
      serviceAccountEmail: config.serviceAccountEmail,
      privateKey,
      subject: hostEmail,
    });

    try {
      const request = solicitudProvider(claim.event);
      let result: MeetProvisionResult | null = null;

      switch (claim.operacion) {
        case "PROVISIONAR":
          result = await provisionar(provider, dependencies.db, claim.event, request);
          break;
        case "REPROGRAMAR":
          result = await reprogramarYReconciliar(provider, claim.event, request);
          break;
        case "CONFIGURAR_MEET":
          result = await configurarMeet(provider, claim.event, request);
          break;
        case "CANCELAR": {
          if (claim.event.externalEventId) {
            try {
              await provider.cancelarEvento(hostEmail, claim.event.externalEventId);
            } catch (error) {
              if (!esEventoInexistente(error)) throw error;
            }
          }
          const completed = await finalizarOperacion(dependencies.db, claim, null, true);
          results.push({
            eventoProveedorId: id,
            estado: completed ? "SINCRONIZADA" : "EN_PROCESO",
          });
          continue;
        }
      }

      const completed = await finalizarOperacion(dependencies.db, claim, result, false);
      results.push({
        eventoProveedorId: id,
        estado: completed ? "SINCRONIZADA" : "EN_PROCESO",
        ...(completed && result?.codigoReunion ? { codigoReunion: result.codigoReunion } : {}),
      });
    } catch (error) {
      results.push(await registrarErrorReclamado(
        dependencies.db,
        claim,
        mensaje(error, "Error desconocido de Google."),
      ));
    }
  }

  return results;
}

type EventoReclamable = Prisma.EventoProveedorGetPayload<{
  include: {
    cuentaProveedor: true;
    instancia: {
      include: {
        solicitud: true;
        cohosts: { include: { cuentaGoogle: { select: { email: true } } } };
        cohostEmails: true;
      };
    };
  };
}>;

type Claim = Readonly<{
  event: EventoReclamable;
  operacion: OperacionPendiente;
  at: Date;
}>;

async function reclamarEvento(db: PrismaClient, id: string): Promise<Claim | null> {
  return db.$transaction(async (tx) => {
    await bloquearEventoProveedor(tx, id);
    const event = await tx.eventoProveedor.findUnique({
      where: { id },
      include: {
        cuentaProveedor: true,
        instancia: {
          include: {
            solicitud: true,
            cohosts: { include: { cuentaGoogle: { select: { email: true } } } },
            cohostEmails: true,
          },
        },
      },
    });
    if (!event?.operacionPendiente) return null;
    if (event.reclamoIntegracionAt && event.reclamoIntegracionAt > new Date(Date.now() - CLAIM_TIMEOUT_MS)) {
      return null;
    }

    const at = new Date();
    const operacion = event.operacionPendiente as OperacionPendiente;
    const updated = await tx.eventoProveedor.updateMany({
      where: {
        id,
        operacionPendiente: operacion,
        reclamoIntegracionAt: event.reclamoIntegracionAt,
        updatedAt: event.updatedAt,
      },
      data: {
        reclamoIntegracionAt: at,
        estadoIntegracion: "PENDIENTE",
        errorIntegracion: null,
      },
    });
    if (updated.count !== 1) return null;
    return { event, operacion, at };
  });
}

async function provisionar(
  provider: MeetProvider,
  db: PrismaClient,
  event: EventoReclamable,
  request: MeetProvisionRequest,
): Promise<MeetProvisionResult> {
  let externalEventId = event.externalEventId;
  if (!externalEventId) {
    const shared = await db.eventoProveedor.findFirst({
      where: {
        id: { not: event.id },
        instancia: {
          solicitudSalaId: event.instancia.solicitudSalaId,
          estado: "PROGRAMADA",
        },
        estadoIntegracion: "SINCRONIZADA",
      },
      orderBy: { updatedAt: "asc" },
      select: { payloadUltimo: true },
    });
    const created = await provider.crearEventoCalendar({
      ...request,
      conferenceData: extraerConferenceData(shared?.payloadUltimo),
    });
    externalEventId = created.externalEventId;
    await db.eventoProveedor.update({
      where: { id: event.id },
      data: {
        externalEventId,
        payloadUltimo: JSON.parse(JSON.stringify(created.payload)),
      },
    });
  }

  const result = await obtenerConReintentos(provider, request.calendarId, externalEventId);
  if (!result) throw new Error("Google Calendar todavía no terminó de generar el enlace Meet.");
  await provider.configurarEventoMeet(request, result);
  return result;
}

async function reprogramarYReconciliar(
  provider: MeetProvider,
  event: EventoReclamable,
  request: MeetProvisionRequest,
): Promise<MeetProvisionResult> {
  if (!event.externalEventId) throw new Error("No existe un evento Calendar para reprogramar.");
  await provider.actualizarEvento(request.calendarId, event.externalEventId, request);
  const result = await obtenerConReintentos(provider, request.calendarId, event.externalEventId);
  if (!result) throw new Error("Google Calendar no confirmó el evento reprogramado.");
  await provider.configurarEventoMeet(request, result);
  return result;
}

async function configurarMeet(
  provider: MeetProvider,
  event: EventoReclamable,
  request: MeetProvisionRequest,
): Promise<MeetProvisionResult> {
  if (!event.externalEventId) throw new Error("No existe un evento Calendar para configurar Meet.");
  const result = await obtenerConReintentos(provider, request.calendarId, event.externalEventId);
  if (!result) throw new Error("Google Calendar todavía no confirmó el enlace Meet.");
  await provider.configurarEventoMeet(request, result);
  return result;
}

function solicitudProvider(event: EventoReclamable): MeetProvisionRequest {
  const { instancia } = event;
  return {
    titulo: instancia.solicitud.titulo,
    descripcion: instancia.descripcion ?? instancia.solicitud.descripcion ?? undefined,
    inicio: instancia.inicioProgramadoAt,
    fin: instancia.finProgramadoAt,
    timezone: instancia.timezone,
    calendarId: event.cuentaProveedor!.emailOrganizador!,
    cohostEmails: normalizeCohostEmails([
      ...instancia.cohosts.map(({ cuentaGoogle }) => cuentaGoogle.email),
      ...instancia.cohostEmails.map(({ email }) => email),
    ]),
    requiereAsistenciaTecnica: instancia.requiereAsistenciaTecnica,
    calendarEventId: calendarEventId(event.id),
  };
}

async function obtenerConReintentos(
  provider: MeetProvider,
  calendarId: string,
  id: string,
): Promise<MeetProvisionResult | null> {
  for (const delay of [0, 250, 500, 1000, 2000]) {
    if (delay) await new Promise((resolve) => setTimeout(resolve, delay));
    const result = await provider.obtenerEvento(calendarId, id);
    if (result) return result;
  }
  return null;
}

async function finalizarOperacion(
  db: PrismaClient,
  claim: Claim,
  result: MeetProvisionResult | null,
  cancelacion: boolean,
): Promise<boolean> {
  const completed = await db.$transaction(async (tx) => {
    const updated = await tx.eventoProveedor.updateMany({
      where: {
        id: claim.event.id,
        operacionPendiente: claim.operacion,
        reclamoIntegracionAt: claim.at,
      },
      data: {
        estadoIntegracion: "SINCRONIZADA",
        operacionPendiente: null,
        reclamoIntegracionAt: null,
        errorIntegracion: null,
        sincronizadoAt: new Date(),
        ...(result ? {
          externalEventId: result.externalEventId,
          codigoReunion: result.codigoReunion,
          joinUrl: result.joinUrl,
          payloadUltimo: JSON.parse(JSON.stringify(result.payload)),
        } : {}),
      },
    });
    if (updated.count !== 1) return false;

    const current = await tx.eventoProveedor.findUnique({
      where: { id: claim.event.id },
      select: { instancia: { select: { solicitudSalaId: true, estado: true } } },
    });
    if (!cancelacion && current && current.instancia.estado !== "CANCELADA") {
      await recalcularSolicitud(tx, current.instancia.solicitudSalaId);
    }
    return true;
  });

  if (!completed) await asegurarReconciliacionActual(db, claim.event.id);
  return completed;
}

async function registrarErrorReclamado(
  db: PrismaClient,
  claim: Claim,
  error: string,
): Promise<ProvisionResult> {
  const applied = await db.$transaction(async (tx) => {
    const updated = await tx.eventoProveedor.updateMany({
      where: {
        id: claim.event.id,
        operacionPendiente: claim.operacion,
        reclamoIntegracionAt: claim.at,
      },
      data: {
        estadoIntegracion: "ERROR",
        errorIntegracion: error,
        reclamoIntegracionAt: null,
      },
    });
    if (updated.count !== 1) return false;
    const current = await tx.eventoProveedor.findUnique({
      where: { id: claim.event.id },
      select: { instancia: { select: { solicitudSalaId: true, estado: true } } },
    });
    if (current && current.instancia.estado !== "CANCELADA") {
      await recalcularSolicitud(tx, current.instancia.solicitudSalaId);
    }
    return true;
  });

  if (!applied) {
    await asegurarReconciliacionActual(db, claim.event.id);
    return { eventoProveedorId: claim.event.id, estado: "EN_PROCESO" };
  }
  return { eventoProveedorId: claim.event.id, estado: "ERROR", error };
}

async function registrarErrorSinClaim(
  db: PrismaClient,
  id: string,
  error: string,
): Promise<ProvisionResult> {
  return db.$transaction(async (tx) => {
    const current = await tx.eventoProveedor.findUnique({
      where: { id },
      select: {
        operacionPendiente: true,
        reclamoIntegracionAt: true,
        estadoIntegracion: true,
        errorIntegracion: true,
        instancia: { select: { solicitudSalaId: true, estado: true } },
      },
    });
    if (!current?.operacionPendiente) return resultadoSinOperacion(id, current ?? undefined);
    if (current.reclamoIntegracionAt) return { eventoProveedorId: id, estado: "EN_PROCESO" };

    const updated = await tx.eventoProveedor.updateMany({
      where: { id, operacionPendiente: current.operacionPendiente, reclamoIntegracionAt: null },
      data: { estadoIntegracion: "ERROR", errorIntegracion: error },
    });
    if (updated.count !== 1) return { eventoProveedorId: id, estado: "EN_PROCESO" };
    if (current.instancia.estado !== "CANCELADA") {
      await recalcularSolicitud(tx, current.instancia.solicitudSalaId);
    }
    return { eventoProveedorId: id, estado: "ERROR", error };
  });
}

async function asegurarReconciliacionActual(db: PrismaClient, id: string): Promise<void> {
  await db.$transaction(async (tx) => {
    const current = await tx.eventoProveedor.findUnique({
      where: { id },
      select: {
        externalEventId: true,
        operacionPendiente: true,
        reclamoIntegracionAt: true,
        instancia: { select: { estado: true, solicitudSalaId: true } },
      },
    });
    if (!current) return;

    if (current.reclamoIntegracionAt) {
      const invalidated = await tx.eventoProveedor.updateMany({
        where: {
          id,
          operacionPendiente: current.operacionPendiente,
          reclamoIntegracionAt: current.reclamoIntegracionAt,
        },
        data: {
          estadoIntegracion: "PENDIENTE",
          reclamoIntegracionAt: null,
          errorIntegracion: null,
        },
      });
      if (invalidated.count === 1 && current.instancia.estado !== "CANCELADA") {
        await recalcularSolicitud(tx, current.instancia.solicitudSalaId);
      }
      return;
    }
    if (current.operacionPendiente) return;

    const operacion: OperacionPendiente = current.instancia.estado === "CANCELADA"
      ? "CANCELAR"
      : current.externalEventId
        ? "REPROGRAMAR"
        : "PROVISIONAR";

    const updated = await tx.eventoProveedor.updateMany({
      where: { id, operacionPendiente: null, reclamoIntegracionAt: null },
      data: {
        estadoIntegracion: "PENDIENTE",
        operacionPendiente: operacion,
        errorIntegracion: null,
      },
    });
    if (updated.count === 1 && current.instancia.estado !== "CANCELADA") {
      await recalcularSolicitud(tx, current.instancia.solicitudSalaId);
    }
  });
}

async function estadoActual(db: PrismaClient, id: string): Promise<ProvisionResult> {
  const current = await db.eventoProveedor.findUnique({
    where: { id },
    select: {
      estadoIntegracion: true,
      operacionPendiente: true,
      reclamoIntegracionAt: true,
      errorIntegracion: true,
    },
  });
  if (!current) return { eventoProveedorId: id, estado: "ERROR", error: "El evento proveedor no existe." };
  if (!current.operacionPendiente) return resultadoSinOperacion(id, current);
  return { eventoProveedorId: id, estado: "EN_PROCESO" };
}

function resultadoSinOperacion(
  id: string,
  current?: Readonly<{ estadoIntegracion: string; errorIntegracion?: string | null }>,
): ProvisionResult {
  if (!current) return { eventoProveedorId: id, estado: "ERROR", error: "El evento proveedor no existe." };
  if (current.estadoIntegracion === "ERROR" || current.estadoIntegracion === "PENDIENTE") {
    return {
      eventoProveedorId: id,
      estado: "REQUIERE_REVISION",
      ...(current.errorIntegracion ? { error: current.errorIntegracion } : {}),
    };
  }
  return { eventoProveedorId: id, estado: "SINCRONIZADA" };
}

function calendarEventId(id: string): string {
  return `a${createHash("sha256").update(id).digest("hex")}`;
}

function mensaje(error: unknown, fallback: string): string {
  return error instanceof Error ? error.message : fallback;
}

function esEventoInexistente(error: unknown): boolean {
  if (!error || typeof error !== "object") return false;
  const value = error as { code?: unknown; status?: unknown; response?: { status?: unknown } };
  return value.code === 404 || value.code === 410 || value.status === 404 || value.status === 410 ||
    value.response?.status === 404 || value.response?.status === 410;
}
