import { Prisma, type PrismaClient } from "@prisma/client";
import type { SessionActor } from "@/src/lib/auth/session-actor.adapter";
import { normalizeCohostEmails } from "../meet/cohosts.domain";
import type { GoogleCalendarCredentials } from "../meet/google-calendar.adapter";
import type { MeetProvider } from "../meet/provider";
import { conReintentosPorLimiteGoogle } from "../meet/google-api-retry.adapter";
import {
  actualizarEncuentroSchema,
  agregarEncuentroSchema,
  elegirCuentaHostParaPeriodos,
  puedeGestionarEncuentros
} from "./encuentros.domain";
import { bloquearReservaSalas } from "./reserva-salas.adapter";
import { bloquearSolicitudSala } from "./reserva-salas.adapter";
import { pertenecenAlMismoDia } from "./periodos.domain";
import {
  auditarEncuentro as auditar,
  cargarCredencialesEncuentro,
  cargarEncuentro,
  recalcularSolicitud
} from "./encuentros-persistence.adapter";

export type GestionEncuentrosDependencies = Readonly<{
  db: PrismaClient;
  descifrar: (value: string) => string;
  crearProvider: (credentials: GoogleCalendarCredentials) => MeetProvider;
  configurarEspacio: (
    credentials: GoogleCalendarCredentials,
    codigoReunion: string,
    settings: Readonly<{ requiereAsistenciaTecnica?: boolean }>
  ) => Promise<void>;
}>;

export async function agregarEncuentro(
  dependencies: GestionEncuentrosDependencies,
  actor: SessionActor,
  solicitudId: string,
  rawInput: unknown
) {
  const input = agregarEncuentroSchema.parse(rawInput);
  const request = await dependencies.db.solicitudSala.findUnique({
    where: { id: solicitudId },
    include: {
      docentePrograma: { include: { docente: true } },
      instancias: {
        include: {
          eventosProveedor: true,
          cohosts: { select: { cuentaGoogleId: true } },
          cohostEmails: { select: { email: true } }
        },
        orderBy: { ordinal: "asc" }
      }
    }
  });
  validarGestion(actor, request?.docentePrograma.docente.usuarioId);
  if (!request || input.inicio <= new Date()) throw new Error("El encuentro debe comenzar en el futuro.");
  if (request.instancias.some((meeting) =>
    meeting.estado === "PROGRAMADA" &&
    input.inicio < meeting.finProgramadoAt &&
    input.fin > meeting.inicioProgramadoAt
  )) {
    throw new Error("El nuevo encuentro se superpone con otro de la misma serie.");
  }

  const provider = await dependencies.db.proveedorReunion.findUnique({ where: { tipo: "GOOGLE_MEET" } });
  if (!provider) throw new Error("Google Meet no está configurado como proveedor.");
  const preferredHost = request.instancias.flatMap(({ eventosProveedor }) =>
    eventosProveedor.flatMap(({ cuentaProveedorId }) => cuentaProveedorId ? [cuentaProveedorId] : [])
  )[0] ?? null;
  return dependencies.db.$transaction(async (tx) => {
    await bloquearSolicitudSala(tx, solicitudId);
    const serie = await tx.solicitudSala.findUnique({
      where: { id: solicitudId },
      include: {
        docentePrograma: { include: { docente: true } },
        instancias: { include: { eventosProveedor: true, cohosts: { select: { cuentaGoogleId: true } }, cohostEmails: { select: { email: true } } }, orderBy: { ordinal: "asc" } }
      }
    });
    validarGestion(actor, serie?.docentePrograma.docente.usuarioId);
    if (!serie || input.inicio <= new Date() || !pertenecenAlMismoDia(input.inicio, input.fin, serie.timezone)) {
      throw new Error("El encuentro debe comenzar en el futuro y finalizar el mismo día de la serie.");
    }
    if (serie.instancias.some((item) => item.estado === "PROGRAMADA" && input.inicio < item.finProgramadoAt && input.fin > item.inicioProgramadoAt)) {
      throw new Error("El nuevo encuentro se superpone con otro de la misma serie.");
    }
    await bloquearReservaSalas(tx, provider.id);
    const [hosts, conflicts] = await Promise.all([
      tx.cuentaProveedor.findMany({
        where: { proveedorId: provider.id, activa: true, tieneLicencia: true },
        orderBy: { prioridad: "asc" },
        select: { id: true, prioridad: true, limiteConcurrente: true }
      }),
      tx.eventoProveedor.findMany({
        where: {
          proveedorId: provider.id,
          cuentaProveedorId: { not: null },
          instancia: {
            estado: "PROGRAMADA",
            inicioProgramadoAt: { lt: input.fin },
            finProgramadoAt: { gt: input.inicio }
          }
        },
        select: {
          cuentaProveedorId: true,
          instancia: { select: { inicioProgramadoAt: true, finProgramadoAt: true } }
        }
      })
    ]);
    const seriePreferredHost = serie.instancias.flatMap(({ eventosProveedor }) => eventosProveedor.flatMap(({ cuentaProveedorId }) => cuentaProveedorId ? [cuentaProveedorId] : []))[0] ?? null;
    const hostId = elegirCuentaHostParaPeriodos(
      seriePreferredHost,
      seriePreferredHost ? hosts.filter(({ id }) => id === seriePreferredHost) : hosts,
      conflicts.flatMap(({ cuentaProveedorId, instancia }) => cuentaProveedorId ? [{
        cuentaProveedorId,
        inicio: instancia.inicioProgramadoAt,
        fin: instancia.finProgramadoAt
      }] : []),
      [input]
    );
    if (!hostId) {
      throw new Error(seriePreferredHost
        ? "La sala de esta serie no está disponible en ese horario."
        : "No hay una sala Meet libre para ese horario.");
    }

    const ordinal = (serie.instancias.reduce((max, item) => Math.max(max, item.ordinal), 0)) + 1;
    const meeting = await tx.instanciaSala.create({
      data: {
        solicitudSalaId: serie.id,
        ordinal,
        descripcion: input.descripcion || serie.descripcion,
        inicioProgramadoAt: input.inicio,
        finProgramadoAt: input.fin,
        timezone: serie.timezone,
        requiereAsistenciaTecnica: input.requiereAsistenciaTecnica,
        requiereGrabacion: input.requiereGrabacion
      }
    });
    const event = await tx.eventoProveedor.create({
      data: { instanciaSalaId: meeting.id, proveedorId: provider.id, cuentaProveedorId: hostId, operacionPendiente: "PROVISIONAR" }
    });
    const cohostIds = cohostsComunes(serie.instancias.map(({ cohosts }) => cohosts.map(({ cuentaGoogleId }) => cuentaGoogleId)));
    if (cohostIds.length) {
      await tx.cohostReunion.createMany({
        data: cohostIds.map((cuentaGoogleId) => ({ instanciaSalaId: meeting.id, cuentaGoogleId }))
      });
    }
    const cohostEmails = normalizeCohostEmails(
      cohostsComunes(serie.instancias.map(({ cohostEmails }) => cohostEmails.map(({ email }) => email)))
    );
    if (cohostEmails.length) {
      await tx.cohostEmailReunion.createMany({
        data: cohostEmails.map((email) => ({ instanciaSalaId: meeting.id, email }))
      });
    }
    await recalcularSolicitud(tx, serie.id);
    await auditar(tx, actor.id, "ENCUENTRO_AGREGADO", meeting.id, null, {
      inicio: input.inicio.toISOString(),
      fin: input.fin.toISOString(),
      requiereAsistenciaTecnica: input.requiereAsistenciaTecnica,
      requiereGrabacion: input.requiereGrabacion,
      descripcion: meeting.descripcion
    });
    return { instanciaId: meeting.id, eventoProveedorId: event.id };
  });
}

export async function actualizarEncuentro(
  dependencies: GestionEncuentrosDependencies,
  actor: SessionActor,
  solicitudId: string,
  instanciaId: string,
  rawInput: unknown
) {
  const input = actualizarEncuentroSchema.parse(rawInput);
  const meeting = await cargarEncuentro(dependencies.db, solicitudId, instanciaId);
  validarGestion(actor, meeting?.solicitud.docentePrograma.docente.usuarioId);
  if (!meeting || meeting.estado !== "PROGRAMADA") throw new Error("El encuentro no se puede modificar.");

  const event = meeting.eventosProveedor.find(({ proveedor }) => proveedor.tipo === "GOOGLE_MEET");
  if (input.accion !== "CAMBIAR_ASISTENCIA") {
    if (input.inicio <= new Date()) throw new Error("El encuentro debe comenzar en el futuro.");
    await dependencies.db.$transaction(async (tx) => {
      await bloquearSolicitudSala(tx, solicitudId);
      const actual = await tx.instanciaSala.findFirst({
        where: { id: instanciaId, solicitudSalaId: solicitudId },
        include: { solicitud: { include: { docentePrograma: { include: { docente: true } } } }, eventosProveedor: { include: { proveedor: true, cuentaProveedor: true } } }
      });
      validarGestion(actor, actual?.solicitud.docentePrograma.docente.usuarioId);
      if (!actual || actual.estado !== "PROGRAMADA") throw new Error("El encuentro no se puede modificar.");
      if (actual.inicioProgramadoAt <= new Date()) throw new Error("El encuentro debe comenzar en el futuro.");
      if (await tx.instanciaSala.count({ where: { solicitudSalaId: solicitudId, id: { not: instanciaId }, estado: "PROGRAMADA", inicioProgramadoAt: { lt: input.fin }, finProgramadoAt: { gt: input.inicio } } })) {
        throw new Error("La serie no puede tener encuentros superpuestos.");
      }
      if (!pertenecenAlMismoDia(input.inicio, input.fin, actual.timezone)) throw new Error("El encuentro debe finalizar el mismo día de la serie.");
      if (event?.cuentaProveedorId) {
        await bloquearReservaSalas(tx, event.proveedorId);
        const [host, conflicts] = await Promise.all([
          tx.cuentaProveedor.findUnique({
            where: { id: event.cuentaProveedorId },
            select: { id: true, prioridad: true, limiteConcurrente: true }
          }),
          tx.eventoProveedor.findMany({
            where: {
              id: { not: event.id },
              cuentaProveedorId: event.cuentaProveedorId,
              instancia: {
                estado: "PROGRAMADA",
                inicioProgramadoAt: { lt: input.fin },
                finProgramadoAt: { gt: input.inicio }
              }
            },
            select: {
              cuentaProveedorId: true,
              instancia: { select: { inicioProgramadoAt: true, finProgramadoAt: true } }
            }
          })
        ]);
        const available = host && elegirCuentaHostParaPeriodos(
          host.id,
          [host],
          conflicts.map(({ cuentaProveedorId, instancia }) => ({
            cuentaProveedorId: cuentaProveedorId!,
            inicio: instancia.inicioProgramadoAt,
            fin: instancia.finProgramadoAt
          })),
          [input]
        );
        if (!available) throw new Error("La sala Meet ya alcanzó su límite en ese horario.");
      }
      await tx.instanciaSala.update({
        where: { id: meeting.id },
        data: {
          inicioProgramadoAt: input.inicio,
          finProgramadoAt: input.fin,
          ...(input.descripcion !== undefined ? { descripcion: input.descripcion || null } : {})
        }
      });
      if (event?.externalEventId) {
        await tx.eventoProveedor.update({ where: { id: event.id }, data: { estadoIntegracion: "PENDIENTE", operacionPendiente: "REPROGRAMAR", reclamoIntegracionAt: null, errorIntegracion: null } });
      }
      await recalcularSolicitud(tx, solicitudId);
      await auditar(tx, actor.id, "ENCUENTRO_REPROGRAMADO", meeting.id, {
        inicio: meeting.inicioProgramadoAt.toISOString(),
        fin: meeting.finProgramadoAt.toISOString(),
        descripcion: meeting.descripcion
      }, {
        inicio: input.inicio.toISOString(),
        fin: input.fin.toISOString(),
        descripcion: input.descripcion === undefined ? meeting.descripcion : input.descripcion || null
      });
    });
    if (!event?.externalEventId || !event.cuentaProveedor?.emailOrganizador) return { warning: null };
    try {
      const credentials = await cargarCredencialesEncuentro(dependencies.db, dependencies.descifrar, event.cuentaProveedor.emailOrganizador);
      await dependencies.crearProvider(credentials).actualizarEvento(event.cuentaProveedor.emailOrganizador, event.externalEventId, {
        titulo: meeting.solicitud.titulo, descripcion: input.descripcion ?? meeting.descripcion ?? meeting.solicitud.descripcion ?? "", inicio: input.inicio, fin: input.fin, timezone: meeting.timezone
      });
      await dependencies.db.eventoProveedor.update({ where: { id: event.id }, data: { estadoIntegracion: "SINCRONIZADA", operacionPendiente: null, reclamoIntegracionAt: null, errorIntegracion: null, sincronizadoAt: new Date() } });
      return { warning: null };
    } catch (error) {
      const detail = error instanceof Error ? error.message : "Error desconocido de Google Calendar.";
      await dependencies.db.eventoProveedor.update({ where: { id: event.id }, data: { estadoIntegracion: "ERROR", operacionPendiente: "REPROGRAMAR", reclamoIntegracionAt: null, errorIntegracion: detail } });
      return { warning: `La reprogramación quedó pendiente de sincronización con Google: ${detail}` };
    }
  }

  await dependencies.db.$transaction(async (tx) => {
    await tx.instanciaSala.update({
      where: { id: meeting.id },
      data: { requiereAsistenciaTecnica: input.requiereAsistenciaTecnica }
    });
    if (!input.requiereAsistenciaTecnica) {
      await Promise.all([
        tx.asignacionAsistenciaTecnica.updateMany({
          where: { instanciaSalaId: meeting.id, estado: { in: ["ASIGNADO", "ACEPTADO"] } },
          data: { estado: "CANCELADO" }
        }),
        tx.postulacionAsistenciaTecnica.updateMany({
          where: { instanciaSalaId: meeting.id, estado: "ME_INTERESA" },
          data: { estado: "RETIRADO" }
        })
      ]);
    }
    await recalcularSolicitud(tx, solicitudId);
    if (event?.codigoReunion) {
      await tx.eventoProveedor.update({ where: { id: event.id }, data: { estadoIntegracion: "PENDIENTE", operacionPendiente: "CONFIGURAR_MEET", reclamoIntegracionAt: null, errorIntegracion: null } });
    }
    await auditar(tx, actor.id, input.requiereAsistenciaTecnica ? "ASISTENCIA_SOLICITADA" : "ASISTENCIA_CANCELADA", meeting.id, {
      requiereAsistenciaTecnica: meeting.requiereAsistenciaTecnica
    }, { requiereAsistenciaTecnica: input.requiereAsistenciaTecnica });
  });

  if (!event?.codigoReunion) return { warning: null };
  try {
    const credentials = await cargarCredencialesEncuentro(
      dependencies.db,
      dependencies.descifrar,
      event.cuentaProveedor?.emailOrganizador
    );
    await dependencies.configurarEspacio(credentials, event.codigoReunion, {
      requiereAsistenciaTecnica: input.requiereAsistenciaTecnica
    });
    await dependencies.db.eventoProveedor.update({ where: { id: event.id }, data: { estadoIntegracion: "SINCRONIZADA", operacionPendiente: null, reclamoIntegracionAt: null, errorIntegracion: null, sincronizadoAt: new Date() } });
    return { warning: null };
  } catch (error) {
    const detail = error instanceof Error ? error.message : "Error desconocido de Google Workspace.";
    if (event) await dependencies.db.eventoProveedor.update({ where: { id: event.id }, data: { estadoIntegracion: "ERROR", operacionPendiente: "CONFIGURAR_MEET", reclamoIntegracionAt: null, errorIntegracion: detail } });
    return {
      warning: `La asistencia técnica se actualizó en la app, pero Google Meet no pudo sincronizarse: ${detail}`
    };
  }
}

export async function eliminarEncuentro(
  dependencies: GestionEncuentrosDependencies,
  actor: SessionActor,
  solicitudId: string,
  instanciaId: string
) {
  const meeting = await cargarEncuentro(dependencies.db, solicitudId, instanciaId);
  validarGestion(actor, meeting?.solicitud.docentePrograma.docente.usuarioId);
  if (!meeting || meeting.estado !== "PROGRAMADA" || meeting.inicioProgramadoAt <= new Date()) {
    throw new Error("Solo se pueden eliminar encuentros futuros y programados.");
  }
  const count = await dependencies.db.instanciaSala.count({ where: { solicitudSalaId: solicitudId } });
  if (count <= 1) throw new Error("Una Reunión debe conservar al menos un encuentro.");
  await dependencies.db.$transaction(async (tx) => {
    await bloquearSolicitudSala(tx, solicitudId);
    const countAfterLock = await tx.instanciaSala.count({ where: { solicitudSalaId: solicitudId, estado: { not: "CANCELADA" } } });
    if (countAfterLock <= 1) throw new Error("Una Reunión debe conservar al menos un encuentro.");
    await auditar(tx, actor.id, "ENCUENTRO_ELIMINADO", meeting.id, {
      inicio: meeting.inicioProgramadoAt.toISOString(),
      fin: meeting.finProgramadoAt.toISOString()
    }, null);
    await tx.instanciaSala.update({ where: { id: meeting.id }, data: { estado: "CANCELADA" } });
    await tx.eventoProveedor.updateMany({ where: { instanciaSalaId: meeting.id }, data: { estadoIntegracion: "PENDIENTE", operacionPendiente: "CANCELAR", reclamoIntegracionAt: null, errorIntegracion: null } });
    await recalcularSolicitud(tx, solicitudId);
  });
}

export async function eliminarReunionCompleta(
  dependencies: GestionEncuentrosDependencies,
  actor: SessionActor,
  solicitudId: string
) {
  const request = await dependencies.db.solicitudSala.findUnique({
    where: { id: solicitudId },
    include: {
      docentePrograma: { include: { docente: true } },
      instancias: {
        include: {
          eventosProveedor: { include: { proveedor: true, cuentaProveedor: true } },
          detallesLiquidacion: { select: { id: true } }
        }
      }
    }
  });
  validarGestion(actor, request?.docentePrograma.docente.usuarioId);
  if (!request) throw new Error("La reunión no existe.");
  if (request.instancias.some(({ estado, inicioProgramadoAt }) =>
    estado !== "PROGRAMADA" || inicioProgramadoAt <= new Date()
  )) {
    throw new Error("Solo se puede eliminar una reunión si todos sus encuentros son futuros y programados.");
  }
  if (request.instancias.some(({ detallesLiquidacion }) => detallesLiquidacion.length > 0)) {
    throw new Error("La reunión tiene liquidaciones asociadas y no se puede eliminar.");
  }

  await dependencies.db.$transaction(async (tx) => {
    await bloquearSolicitudSala(tx, solicitudId);
    await tx.auditoria.create({
      data: {
        actorUsuarioId: actor.id,
        accion: "REUNION_ELIMINADA",
        entidadTipo: "SolicitudSala",
        entidadId: request.id,
        valorAnterior: {
          titulo: request.titulo,
          encuentros: request.instancias.length
        },
        valorNuevo: Prisma.JsonNull
      }
    });
    await tx.instanciaSala.updateMany({ where: { solicitudSalaId: request.id }, data: { estado: "CANCELADA" } });
    await tx.eventoProveedor.updateMany({ where: { instancia: { solicitudSalaId: request.id } }, data: { estadoIntegracion: "PENDIENTE", operacionPendiente: "CANCELAR", reclamoIntegracionAt: null, errorIntegracion: null } });
    await tx.solicitudSala.update({ where: { id: request.id }, data: { estado: "CANCELADA", canceladaAt: new Date(), canceladaMotivo: "Eliminación solicitada; cancelaciones Google pendientes." } });
  });
}

function validarGestion(actor: SessionActor, docenteUsuarioId?: string): void {
  if (!actor.activo || !docenteUsuarioId || !puedeGestionarEncuentros(actor.rol, actor.id, docenteUsuarioId)) {
    throw new Error("No tiene permisos para gestionar estos encuentros.");
  }
}

function esEventoCalendarInexistente(error: unknown): boolean {
  if (!error || typeof error !== "object") return false;
  const candidate = error as {
    code?: unknown;
    status?: unknown;
    response?: { status?: unknown };
  };
  return candidate.code === 404 ||
    candidate.code === 410 ||
    candidate.status === 404 ||
    candidate.status === 410 ||
    candidate.response?.status === 404 ||
    candidate.response?.status === 410;
}

/** A series has no separate cohost-default entity.  Only values common to all
 * existing instances are stable defaults; an exceptional first instance never
 * becomes the default for later ones. */
function cohostsComunes(values: readonly (readonly string[])[]): readonly string[] {
  if (values.length === 0) return [];
  return values[0].filter((value) => values.every((current) => current.includes(value)));
}
