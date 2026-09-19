import { createHash, randomUUID } from "node:crypto";
import type { Prisma, PrismaClient } from "@prisma/client";
import { recalcularSolicitud } from "@/src/modules/reuniones/encuentros-persistence.adapter";
import {
  extraerConferenceData,
  normalizeCohostEmails,
  normalizeMeetLink,
  type ConferenceProvisionRequest,
  type ConferenceProvisionResult,
  type DescartarLoteResult,
  type DescartarOperacionResult,
  type EstadoIntegracionConferencia,
  type OperacionPendienteConferencia,
  type ProvisionConferenciaResult,
  type ReclasificarLoteResult,
} from "../../domain";
import type {
  ClaimInfo,
  ConferenciasRepositoryPort,
  EventoProveedorSnapshot,
  WorkspaceCredentialsResult,
} from "../../ports/conferencias-repository.port";

const CLAIM_TIMEOUT_MS = 10 * 60_000;

export type PrismaConferenciasRepositoryOptions = Readonly<{
  db: PrismaClient;
  descifrarConfiguracion: (val: string) => string;
  recalcularSolicitudFn?: (tx: Prisma.TransactionClient, solicitudId: string) => Promise<void>;
}>;

export function crearPrismaConferenciasRepository(
  options: PrismaConferenciasRepositoryOptions
): ConferenciasRepositoryPort {
  const { db, descifrarConfiguracion } = options;
  const recalcular = options.recalcularSolicitudFn ?? recalcularSolicitud;

  return {
    async obtenerSnapshotsEventos(ids) {
      if (ids.length === 0) return [];
      const rows = await db.eventoProveedor.findMany({
        where: { id: { in: [...ids] }, proveedor: { tipo: "GOOGLE_MEET" } },
        select: {
          id: true,
          estadoIntegracion: true,
          operacionPendiente: true,
          reclamoIntegracionAt: true,
          errorIntegracion: true,
        },
      });

      return rows.map((r) => ({
        id: r.id,
        estadoIntegracion: r.estadoIntegracion as EstadoIntegracionConferencia,
        operacionPendiente: r.operacionPendiente as OperacionPendienteConferencia | null,
        reclamoIntegracionAt: r.reclamoIntegracionAt,
        errorIntegracion: r.errorIntegracion,
      }));
    },

    async obtenerCredencialesWorkspace(): Promise<WorkspaceCredentialsResult> {
      const config = await db.configuracionGoogleWorkspace.findUnique({
        where: { id: "principal", activa: true },
      });
      if (!config?.serviceAccountEmail || !config.privateKeyCifrada) {
        return { disponible: false };
      }
      try {
        const privateKey = descifrarConfiguracion(config.privateKeyCifrada);
        return {
          disponible: true,
          serviceAccountEmail: config.serviceAccountEmail,
          privateKey,
        };
      } catch (err) {
        const error = err instanceof Error ? err.message : "No se pudo leer la clave de Google.";
        return { disponible: false, error };
      }
    },

    async reclamarEvento(id): Promise<ClaimInfo | null> {
      return db.$transaction(async (tx) => {
        await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${`flacso-meet:evento-proveedor:${id}`}))`;
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
        if (
          event.reclamoIntegracionAt &&
          event.reclamoIntegracionAt > new Date(Date.now() - CLAIM_TIMEOUT_MS)
        ) {
          return null;
        }

        const at = new Date();
        const token = randomUUID();
        const operacion = event.operacionPendiente as OperacionPendienteConferencia;
        const updated = await tx.eventoProveedor.updateMany({
          where: {
            id,
            operacionPendiente: operacion,
            reclamoIntegracionAt: event.reclamoIntegracionAt,
            reclamoIntegracionToken: event.reclamoIntegracionToken,
            updatedAt: event.updatedAt,
          },
          data: {
            reclamoIntegracionAt: at,
            reclamoIntegracionToken: token,
            estadoIntegracion: "PENDIENTE",
            errorIntegracion: null,
          },
        });
        if (updated.count !== 1) return null;

        const request = buildProvisionRequest(event);
        return {
          event: {
            id: event.id,
            externalEventId: event.externalEventId,
            solicitudSalaId: event.instancia.solicitudSalaId,
            organizerEmail: event.cuentaProveedor?.emailOrganizador ?? "",
            request,
          },
          operacion,
          at,
          token,
        };
      });
    },

    async buscarConferenceDataCompartida(solicitudSalaId, excludeEventoId) {
      const shared = await db.eventoProveedor.findFirst({
        where: {
          id: { not: excludeEventoId },
          instancia: {
            solicitudSalaId,
            estado: "PROGRAMADA",
          },
          estadoIntegracion: "SINCRONIZADA",
        },
        orderBy: { updatedAt: "asc" },
        select: { payloadUltimo: true },
      });
      return extraerConferenceData(shared?.payloadUltimo);
    },

    async guardarExternalEventIdTemprano(id, externalEventId, payload) {
      await db.eventoProveedor.update({
        where: { id },
        data: {
          externalEventId,
          payloadUltimo: JSON.parse(JSON.stringify(payload)),
        },
      });
    },

    async persistirMeetDetectado(id, result) {
      await db.eventoProveedor.update({
        where: { id },
        data: {
          externalEventId: result.externalEventId,
          codigoReunion: normalizeMeetLink(result.codigoReunion)?.code ?? result.codigoReunion,
          joinUrl: normalizeMeetLink(result.joinUrl)?.url ?? result.joinUrl,
          payloadUltimo: JSON.parse(JSON.stringify(result.payload)),
        },
      });
    },

    async finalizarOperacion(claim, result, cancelacion) {
      return db.$transaction(async (tx) => {
        const updated = await tx.eventoProveedor.updateMany({
          where: {
            id: claim.event.id,
            operacionPendiente: claim.operacion,
            reclamoIntegracionAt: claim.at,
            reclamoIntegracionToken: claim.token,
          },
          data: {
            estadoIntegracion: "SINCRONIZADA",
            operacionPendiente: null,
            reclamoIntegracionAt: null,
            reclamoIntegracionToken: null,
            errorIntegracion: null,
            sincronizadoAt: new Date(),
            ...(result
              ? {
                  externalEventId: result.externalEventId,
                  codigoReunion:
                    normalizeMeetLink(result.codigoReunion)?.code ?? result.codigoReunion,
                  joinUrl: normalizeMeetLink(result.joinUrl)?.url ?? result.joinUrl,
                  payloadUltimo: JSON.parse(JSON.stringify(result.payload)),
                }
              : {}),
          },
        });
        if (updated.count !== 1) return false;

        const current = await tx.eventoProveedor.findUnique({
          where: { id: claim.event.id },
          select: {
            instancia: {
              select: {
                solicitudSalaId: true,
                estado: true,
                solicitud: { select: { estado: true } },
              },
            },
          },
        });

        if (!cancelacion && current && current.instancia.estado !== "CANCELADA") {
          await recalcular(tx, current.instancia.solicitudSalaId);
        }
        if (cancelacion && current?.instancia.solicitud.estado === "CANCELADA") {
          const pendientes = await tx.eventoProveedor.count({
            where: {
              instancia: { solicitudSalaId: current.instancia.solicitudSalaId },
              operacionPendiente: "CANCELAR",
            },
          });
          if (pendientes === 0) {
            await tx.solicitudSala.update({
              where: { id: current.instancia.solicitudSalaId },
              data: { canceladaMotivo: "Cancelación confirmada en Google Calendar." },
            });
          }
        }
        return true;
      });
    },

    async registrarErrorReclamado(claim, error, scopeConfiguracionMeet = false) {
      const outcome = await db.$transaction(async (tx) => {
        const current = await tx.eventoProveedor.findUnique({
          where: { id: claim.event.id },
          select: {
            joinUrl: true,
            codigoReunion: true,
            instancia: { select: { solicitudSalaId: true, estado: true } },
          },
        });
        const hasMeet = Boolean(current?.joinUrl || current?.codigoReunion);
        const noBloqueante = scopeConfiguracionMeet && hasMeet;
        const proximaOperacion =
          claim.operacion === "PROVISIONAR" && hasMeet
            ? ("CONFIGURAR_MEET" as const)
            : claim.operacion;

        const updated = await tx.eventoProveedor.updateMany({
          where: {
            id: claim.event.id,
            operacionPendiente: claim.operacion,
            reclamoIntegracionAt: claim.at,
            reclamoIntegracionToken: claim.token,
          },
          data: {
            operacionPendiente: proximaOperacion,
            estadoIntegracion: noBloqueante ? "SINCRONIZADA" : "ERROR",
            errorIntegracion: error,
            reclamoIntegracionAt: null,
            reclamoIntegracionToken: null,
          },
        });
        if (updated.count !== 1) return null;
        if (current && current.instancia.estado !== "CANCELADA") {
          await recalcular(tx, current.instancia.solicitudSalaId);
        }
        return noBloqueante ? ("PENDIENTE_CONFIGURACION" as const) : ("ERROR" as const);
      });

      if (!outcome) {
        return { eventoProveedorId: claim.event.id, estado: "EN_PROCESO" };
      }
      return { eventoProveedorId: claim.event.id, estado: outcome, error };
    },

    async registrarErrorSinClaim(id, error): Promise<ProvisionConferenciaResult> {
      return db.$transaction(async (tx) => {
        const current = await tx.eventoProveedor.findUnique({
          where: { id },
          select: {
            operacionPendiente: true,
            reclamoIntegracionAt: true,
            reclamoIntegracionToken: true,
            estadoIntegracion: true,
            errorIntegracion: true,
            instancia: { select: { solicitudSalaId: true, estado: true } },
          },
        });
        if (!current?.operacionPendiente) {
          return resultadoSinOperacion(id, current ?? undefined);
        }
        if (current.reclamoIntegracionAt || current.reclamoIntegracionToken) {
          return { eventoProveedorId: id, estado: "EN_PROCESO" };
        }

        const updated = await tx.eventoProveedor.updateMany({
          where: {
            id,
            operacionPendiente: current.operacionPendiente,
            reclamoIntegracionAt: null,
            reclamoIntegracionToken: null,
          },
          data: { estadoIntegracion: "ERROR", errorIntegracion: error },
        });
        if (updated.count !== 1) return { eventoProveedorId: id, estado: "EN_PROCESO" };
        if (current.instancia.estado !== "CANCELADA") {
          await recalcular(tx, current.instancia.solicitudSalaId);
        }
        return { eventoProveedorId: id, estado: "ERROR", error };
      });
    },

    async obtenerEstadoActual(id): Promise<ProvisionConferenciaResult> {
      const current = await db.eventoProveedor.findUnique({
        where: { id },
        select: {
          estadoIntegracion: true,
          operacionPendiente: true,
          reclamoIntegracionAt: true,
          errorIntegracion: true,
        },
      });
      if (!current) {
        return {
          eventoProveedorId: id,
          estado: "ERROR",
          error: "El evento proveedor no existe.",
        };
      }
      if (!current.operacionPendiente) return resultadoSinOperacion(id, current);
      return { eventoProveedorId: id, estado: "EN_PROCESO" };
    },

    async descartarOperacionPendiente(eventoProveedorId): Promise<DescartarOperacionResult> {
      return db.$transaction(async (tx) => {
        const event = await tx.eventoProveedor.findUnique({
          where: { id: eventoProveedorId },
          select: {
            id: true,
            joinUrl: true,
            codigoReunion: true,
            operacionPendiente: true,
            estadoIntegracion: true,
            instancia: {
              select: {
                solicitudSalaId: true,
                estado: true,
              },
            },
          },
        });

        if (!event) {
          return { eventoProveedorId, descartada: false, motivo: "El evento no existe." };
        }

        if (!event.operacionPendiente) {
          return {
            eventoProveedorId,
            descartada: false,
            motivo: "El evento no tiene operación pendiente.",
          };
        }

        const hasMeet = Boolean(event.joinUrl || event.codigoReunion);

        await tx.eventoProveedor.update({
          where: { id: eventoProveedorId },
          data: {
            operacionPendiente: null,
            reclamoIntegracionAt: null,
            reclamoIntegracionToken: null,
            errorIntegracion: null,
            estadoIntegracion: hasMeet ? "SINCRONIZADA" : event.estadoIntegracion,
          },
        });

        if (event.instancia && event.instancia.estado !== "CANCELADA") {
          await recalcular(tx, event.instancia.solicitudSalaId);
        }

        return { eventoProveedorId, descartada: true };
      });
    },

    async descartarOperacionesNoBloqueantesLote(): Promise<DescartarLoteResult> {
      return db.$transaction(async (tx) => {
        const candidates = await tx.eventoProveedor.findMany({
          where: {
            proveedor: { tipo: "GOOGLE_MEET" },
            operacionPendiente: { not: null },
            OR: [{ joinUrl: { not: null } }, { codigoReunion: { not: null } }],
          },
          select: {
            id: true,
            instancia: {
              select: {
                solicitudSalaId: true,
                estado: true,
              },
            },
          },
        });

        if (candidates.length === 0) return { totalDescartadas: 0 };

        const ids = candidates.map((item) => item.id);
        const updated = await tx.eventoProveedor.updateMany({
          where: { id: { in: ids } },
          data: {
            operacionPendiente: null,
            reclamoIntegracionAt: null,
            reclamoIntegracionToken: null,
            errorIntegracion: null,
            estadoIntegracion: "SINCRONIZADA",
          },
        });

        const solicitudIds = [
          ...new Set(
            candidates
              .filter((item) => item.instancia && item.instancia.estado !== "CANCELADA")
              .map((item) => item.instancia.solicitudSalaId)
          ),
        ];

        for (const solicitudId of solicitudIds) {
          await recalcular(tx, solicitudId);
        }

        return { totalDescartadas: updated.count };
      });
    },

    async reclasificarOperacionesPendientesLote(): Promise<ReclasificarLoteResult> {
      const result = await db.eventoProveedor.updateMany({
        where: {
          proveedor: { tipo: "GOOGLE_MEET" },
          operacionPendiente: "PROVISIONAR",
          OR: [{ joinUrl: { not: null } }, { codigoReunion: { not: null } }],
        },
        data: {
          operacionPendiente: "CONFIGURAR_MEET",
        },
      });

      return { totalReclasificadas: result.count };
    },
  };
}

function buildProvisionRequest(event: {
  id: string;
  payloadUltimo: unknown;
  cuentaProveedor: { emailOrganizador: string | null } | null;
  instancia: {
    solicitud: { titulo: string; descripcion: string | null };
    descripcion: string | null;
    inicioProgramadoAt: Date;
    finProgramadoAt: Date;
    timezone: string;
    requiereAsistenciaTecnica: boolean;
    cohosts: { cuentaGoogle: { email: string } }[];
    cohostEmails: { email: string }[];
  };
}): ConferenceProvisionRequest {
  const { instancia } = event;
  const cohostEmails = normalizeCohostEmails([
    ...instancia.cohosts.map(({ cuentaGoogle }) => cuentaGoogle.email),
    ...instancia.cohostEmails.map(({ email }) => email),
  ]);

  return {
    titulo: instancia.solicitud.titulo,
    descripcion: instancia.descripcion ?? instancia.solicitud.descripcion ?? undefined,
    inicio: instancia.inicioProgramadoAt,
    fin: instancia.finProgramadoAt,
    timezone: instancia.timezone,
    calendarId: event.cuentaProveedor?.emailOrganizador ?? "",
    cohostEmails,
    guestEmails: extraerInvitados(event.payloadUltimo, cohostEmails),
    requiereAsistenciaTecnica: instancia.requiereAsistenciaTecnica,
    calendarEventId: calendarEventId(event.id),
  };
}

function extraerInvitados(payload: unknown, cohostEmails: readonly string[]): readonly string[] {
  if (!payload || typeof payload !== "object" || Array.isArray(payload)) return [];
  const record = payload as {
    salaVirtual?: { invitadosEmails?: unknown };
    attendees?: readonly Readonly<{ email?: unknown }>[];
  };
  const cohostSet = new Set(normalizeCohostEmails(cohostEmails));
  const configured = record.salaVirtual?.invitadosEmails;
  if (Array.isArray(configured)) {
    return normalizeCohostEmails(
      configured.flatMap((value) => (typeof value === "string" ? [value.trim()] : [])).filter(Boolean)
    ).filter((email) => !cohostSet.has(email));
  }
  const attendees = Array.isArray(record.attendees)
    ? record.attendees.flatMap(({ email }) => (typeof email === "string" ? [email.trim()] : [])).filter(Boolean)
    : [];
  return normalizeCohostEmails(attendees).filter((email) => !cohostSet.has(email));
}

function calendarEventId(id: string): string {
  return `a${createHash("sha256").update(id).digest("hex")}`;
}

function resultadoSinOperacion(
  id: string,
  current?: Readonly<{ estadoIntegracion: string; errorIntegracion?: string | null }>
): ProvisionConferenciaResult {
  if (!current) {
    return { eventoProveedorId: id, estado: "ERROR", error: "El evento proveedor no existe." };
  }
  if (current.estadoIntegracion === "ERROR" || current.estadoIntegracion === "PENDIENTE") {
    return {
      eventoProveedorId: id,
      estado: "REQUIERE_REVISION",
      ...(current.errorIntegracion ? { error: current.errorIntegracion } : {}),
    };
  }
  return { eventoProveedorId: id, estado: "SINCRONIZADA" };
}
