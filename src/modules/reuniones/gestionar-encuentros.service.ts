import { Prisma, type PrismaClient } from "@prisma/client";
import type { SessionActor } from "@/src/lib/auth/session-actor.adapter";
import {
  ConflictApiError,
  ForbiddenApiError,
  IntegrationApiError,
  NotFoundApiError,
  ValidationApiError,
} from "@/src/lib/http/api-error";
import { normalizeCohostEmails } from "../meet/cohosts.domain";
import type { GoogleCalendarCredentials } from "../meet/google-calendar.adapter";
import type { MeetProvider } from "../meet/provider";
import {
  actualizarEncuentroSchema,
  agregarEncuentroSchema,
  elegirCuentaHostParaPeriodos,
} from "./encuentros.domain";
import { bloquearReservaSalas, bloquearSolicitudSala } from "./reserva-salas.adapter";
import { pertenecenAlMismoDia } from "./periodos.domain";
import { auditarEncuentro as auditar, recalcularSolicitud } from "./encuentros-persistence.adapter";
import { puedeGestionarPrograma } from "./permisos-programa.service";

export type GestionEncuentrosDependencies = Readonly<{
  db: PrismaClient;
  descifrar?: (value: string) => string;
  crearProvider?: (credentials: GoogleCalendarCredentials) => MeetProvider;
  configurarEspacio?: (
    credentials: GoogleCalendarCredentials,
    codigoReunion: string,
    settings: Readonly<{ requiereAsistenciaTecnica?: boolean }>,
  ) => Promise<void>;
}>;

export async function agregarEncuentro(
  dependencies: GestionEncuentrosDependencies,
  actor: SessionActor,
  solicitudId: string,
  rawInput: unknown,
) {
  const input = agregarEncuentroSchema.parse(rawInput);
  const provider = await dependencies.db.proveedorReunion.findUnique({
    where: { tipo: "GOOGLE_MEET" },
  });
  if (!provider) throw new IntegrationApiError("Google Meet no está configurado como proveedor.", 503);

  return dependencies.db.$transaction(async (tx) => {
    await bloquearSolicitudSala(tx, solicitudId);
    const serie = await tx.solicitudSala.findUnique({
      where: { id: solicitudId },
      include: {
        docentePrograma: { include: { docente: true } },
        instancias: {
          include: {
            eventosProveedor: true,
            cohosts: { select: { cuentaGoogleId: true } },
            cohostEmails: { select: { email: true } },
          },
          orderBy: { ordinal: "asc" },
        },
      },
    });
    if (!serie) throw new NotFoundApiError("La reunión no existe.");
    await validarGestion(tx, actor, serie.docentePrograma.programaId);
    if (input.inicio <= new Date()) throw new ValidationApiError("El encuentro debe comenzar en el futuro.");
    if (!pertenecenAlMismoDia(input.inicio, input.fin, serie.timezone)) {
      throw new ValidationApiError("El encuentro debe finalizar el mismo día de la serie.");
    }
    if (serie.instancias.some((item) =>
      item.estado === "PROGRAMADA" && input.inicio < item.finProgramadoAt && input.fin > item.inicioProgramadoAt
    )) {
      throw new ConflictApiError("El nuevo encuentro se superpone con otro de la misma serie.");
    }

    await bloquearReservaSalas(tx, provider.id);
    const [hosts, conflicts] = await Promise.all([
      tx.cuentaProveedor.findMany({
        where: { proveedorId: provider.id, activa: true, tieneLicencia: true },
        orderBy: { prioridad: "asc" },
        select: { id: true, prioridad: true, limiteConcurrente: true },
      }),
      tx.eventoProveedor.findMany({
        where: {
          proveedorId: provider.id,
          cuentaProveedorId: { not: null },
          instancia: {
            estado: "PROGRAMADA",
            inicioProgramadoAt: { lt: input.fin },
            finProgramadoAt: { gt: input.inicio },
          },
        },
        select: {
          cuentaProveedorId: true,
          instancia: { select: { inicioProgramadoAt: true, finProgramadoAt: true } },
        },
      }),
    ]);
    const seriePreferredHost = serie.instancias.flatMap(({ eventosProveedor }) =>
      eventosProveedor.flatMap(({ cuentaProveedorId }) => cuentaProveedorId ? [cuentaProveedorId] : [])
    )[0] ?? null;
    const hostId = elegirCuentaHostParaPeriodos(
      seriePreferredHost,
      seriePreferredHost ? hosts.filter(({ id }) => id === seriePreferredHost) : hosts,
      conflicts.flatMap(({ cuentaProveedorId, instancia }) => cuentaProveedorId ? [{
        cuentaProveedorId,
        inicio: instancia.inicioProgramadoAt,
        fin: instancia.finProgramadoAt,
      }] : []),
      [input],
    );
    if (!hostId) {
      throw new ConflictApiError(seriePreferredHost
        ? "La sala de esta serie no está disponible en ese horario."
        : "No hay una sala Meet libre para ese horario.");
    }

    const ordinal = serie.instancias.reduce((max, item) => Math.max(max, item.ordinal), 0) + 1;
    const meeting = await tx.instanciaSala.create({
      data: {
        solicitudSalaId: serie.id,
        ordinal,
        descripcion: input.descripcion || serie.descripcion,
        inicioProgramadoAt: input.inicio,
        finProgramadoAt: input.fin,
        timezone: serie.timezone,
        requiereAsistenciaTecnica: input.requiereAsistenciaTecnica,
        requiereGrabacion: input.requiereGrabacion,
      },
    });
    // Política explícita: una instancia agregada no hereda asignaciones de
    // asistencia de otras fechas. Queda abierta para una asignación propia,
    // que validará agenda y tarifa mediante reservarAsistenteDisponible.
    const event = await tx.eventoProveedor.create({
      data: {
        instanciaSalaId: meeting.id,
        proveedorId: provider.id,
        cuentaProveedorId: hostId,
        operacionPendiente: "PROVISIONAR",
      },
    });

    const cohostIds = cohostsComunes(
      serie.instancias.map(({ cohosts }) => cohosts.map(({ cuentaGoogleId }) => cuentaGoogleId)),
    );
    if (cohostIds.length) {
      await tx.cohostReunion.createMany({
        data: cohostIds.map((cuentaGoogleId) => ({ instanciaSalaId: meeting.id, cuentaGoogleId })),
      });
    }
    const cohostEmails = normalizeCohostEmails(
      cohostsComunes(serie.instancias.map(({ cohostEmails }) => cohostEmails.map(({ email }) => email))),
    );
    if (cohostEmails.length) {
      await tx.cohostEmailReunion.createMany({
        data: cohostEmails.map((email) => ({ instanciaSalaId: meeting.id, email })),
      });
    }

    await recalcularSolicitud(tx, serie.id);
    await auditar(tx, actor.id, "ENCUENTRO_AGREGADO", meeting.id, null, {
      inicio: input.inicio.toISOString(),
      fin: input.fin.toISOString(),
      requiereAsistenciaTecnica: input.requiereAsistenciaTecnica,
      requiereGrabacion: input.requiereGrabacion,
      descripcion: meeting.descripcion,
    });
    return { instanciaId: meeting.id, eventoProveedorId: event.id };
  });
}

export async function actualizarEncuentro(
  dependencies: GestionEncuentrosDependencies,
  actor: SessionActor,
  solicitudId: string,
  instanciaId: string,
  rawInput: unknown,
): Promise<Readonly<{ eventoProveedorIds: readonly string[] }>> {
  const input = actualizarEncuentroSchema.parse(rawInput);

  return dependencies.db.$transaction(async (tx) => {
    await bloquearSolicitudSala(tx, solicitudId);
    const actual = await cargarEncuentroBloqueado(tx, solicitudId, instanciaId);
    if (!actual) throw new NotFoundApiError("El encuentro no existe.");
    await validarGestion(tx, actor, actual.solicitud.docentePrograma.programaId);
    if (actual.estado !== "PROGRAMADA") throw new ConflictApiError("El encuentro no se puede modificar.");

    const event = actual.eventosProveedor.find(({ proveedor }) => proveedor.tipo === "GOOGLE_MEET");

    if (input.accion !== "CAMBIAR_ASISTENCIA") {
      if (actual.inicioProgramadoAt <= new Date()) {
        throw new ConflictApiError("No se puede reprogramar un encuentro que ya comenzó.");
      }
      if (input.inicio <= new Date()) throw new ValidationApiError("El encuentro debe comenzar en el futuro.");
      if (!pertenecenAlMismoDia(input.inicio, input.fin, actual.timezone)) {
        throw new ValidationApiError("El encuentro debe finalizar el mismo día de la serie.");
      }
      const overlaps = await tx.instanciaSala.count({
        where: {
          solicitudSalaId: solicitudId,
          id: { not: instanciaId },
          estado: "PROGRAMADA",
          inicioProgramadoAt: { lt: input.fin },
          finProgramadoAt: { gt: input.inicio },
        },
      });
      if (overlaps > 0) throw new ConflictApiError("La serie no puede tener encuentros superpuestos.");

      if (event?.cuentaProveedorId) {
        await bloquearReservaSalas(tx, event.proveedorId);
        const [host, conflicts] = await Promise.all([
          tx.cuentaProveedor.findUnique({
            where: { id: event.cuentaProveedorId },
            select: { id: true, prioridad: true, limiteConcurrente: true },
          }),
          tx.eventoProveedor.findMany({
            where: {
              id: { not: event.id },
              cuentaProveedorId: event.cuentaProveedorId,
              instancia: {
                estado: "PROGRAMADA",
                inicioProgramadoAt: { lt: input.fin },
                finProgramadoAt: { gt: input.inicio },
              },
            },
            select: {
              cuentaProveedorId: true,
              instancia: { select: { inicioProgramadoAt: true, finProgramadoAt: true } },
            },
          }),
        ]);
        const available = host && elegirCuentaHostParaPeriodos(
          host.id,
          [host],
          conflicts.flatMap(({ cuentaProveedorId, instancia }) => cuentaProveedorId ? [{
            cuentaProveedorId,
            inicio: instancia.inicioProgramadoAt,
            fin: instancia.finProgramadoAt,
          }] : []),
          [input],
        );
        if (!available) throw new ConflictApiError("La sala Meet ya alcanzó su límite en ese horario.");
      }

      await tx.instanciaSala.update({
        where: { id: actual.id },
        data: {
          inicioProgramadoAt: input.inicio,
          finProgramadoAt: input.fin,
          ...(input.descripcion !== undefined ? { descripcion: input.descripcion || null } : {}),
        },
      });
      if (event) {
        await marcarOperacionPendiente(
          tx,
          event.id,
          event.externalEventId ? "REPROGRAMAR" : "PROVISIONAR",
        );
      }
      await recalcularSolicitud(tx, solicitudId);
      await auditar(tx, actor.id, "ENCUENTRO_REPROGRAMADO", actual.id, {
        inicio: actual.inicioProgramadoAt.toISOString(),
        fin: actual.finProgramadoAt.toISOString(),
        descripcion: actual.descripcion,
      }, {
        inicio: input.inicio.toISOString(),
        fin: input.fin.toISOString(),
        descripcion: input.descripcion === undefined ? actual.descripcion : input.descripcion || null,
      });
      return { eventoProveedorIds: event ? [event.id] : [] };
    }

    await tx.instanciaSala.update({
      where: { id: actual.id },
      data: { requiereAsistenciaTecnica: input.requiereAsistenciaTecnica },
    });
    if (!input.requiereAsistenciaTecnica) {
      await Promise.all([
        tx.asignacionAsistenciaTecnica.updateMany({
          where: { instanciaSalaId: actual.id, estado: { in: ["ASIGNADO", "ACEPTADO"] } },
          data: { estado: "CANCELADO" },
        }),
        tx.postulacionAsistenciaTecnica.updateMany({
          where: { instanciaSalaId: actual.id, estado: "ME_INTERESA" },
          data: { estado: "RETIRADO" },
        }),
      ]);
    }
    if (event) {
      await marcarOperacionPendiente(
        tx,
        event.id,
        event.externalEventId && event.codigoReunion ? "CONFIGURAR_MEET" : "PROVISIONAR",
      );
    }
    await recalcularSolicitud(tx, solicitudId);
    await auditar(
      tx,
      actor.id,
      input.requiereAsistenciaTecnica ? "ASISTENCIA_SOLICITADA" : "ASISTENCIA_CANCELADA",
      actual.id,
      { requiereAsistenciaTecnica: actual.requiereAsistenciaTecnica },
      { requiereAsistenciaTecnica: input.requiereAsistenciaTecnica },
    );
    return { eventoProveedorIds: event ? [event.id] : [] };
  });
}

export async function eliminarEncuentro(
  dependencies: GestionEncuentrosDependencies,
  actor: SessionActor,
  solicitudId: string,
  instanciaId: string,
): Promise<Readonly<{ eventoProveedorIds: readonly string[] }>> {
  return dependencies.db.$transaction(async (tx) => {
    await bloquearSolicitudSala(tx, solicitudId);
    const meeting = await cargarEncuentroBloqueado(tx, solicitudId, instanciaId);
    if (!meeting) throw new NotFoundApiError("El encuentro no existe.");
    await validarGestion(tx, actor, meeting.solicitud.docentePrograma.programaId);
    if (meeting.estado !== "PROGRAMADA" || meeting.inicioProgramadoAt <= new Date()) {
      throw new ConflictApiError("Solo se pueden eliminar encuentros futuros y programados.");
    }

    const count = await tx.instanciaSala.count({
      where: { solicitudSalaId: solicitudId, estado: { not: "CANCELADA" } },
    });
    if (count <= 1) throw new ConflictApiError("Una reunión debe conservar al menos un encuentro.");

    await auditar(tx, actor.id, "ENCUENTRO_ELIMINADO", meeting.id, {
      inicio: meeting.inicioProgramadoAt.toISOString(),
      fin: meeting.finProgramadoAt.toISOString(),
    }, null);
    await tx.instanciaSala.update({ where: { id: meeting.id }, data: { estado: "CANCELADA" } });

    const eventIds = meeting.eventosProveedor
      .filter(({ proveedor }) => proveedor.tipo === "GOOGLE_MEET")
      .map(({ id }) => id);
    if (eventIds.length > 0) {
      await tx.eventoProveedor.updateMany({
        where: { id: { in: eventIds } },
        data: {
          estadoIntegracion: "PENDIENTE",
          operacionPendiente: "CANCELAR",
          reclamoIntegracionAt: null,
          reclamoIntegracionToken: null,
          errorIntegracion: null,
        },
      });
    }
    await recalcularSolicitud(tx, solicitudId);
    return { eventoProveedorIds: eventIds };
  });
}

export async function eliminarReunionCompleta(
  dependencies: GestionEncuentrosDependencies,
  actor: SessionActor,
  solicitudId: string,
): Promise<Readonly<{ eventoProveedorIds: readonly string[] }>> {
  return dependencies.db.$transaction(async (tx) => {
    await bloquearSolicitudSala(tx, solicitudId);
    const request = await tx.solicitudSala.findUnique({
      where: { id: solicitudId },
      include: {
        docentePrograma: { include: { docente: true } },
        instancias: {
          include: {
            eventosProveedor: { include: { proveedor: true } },
            detallesLiquidacion: { select: { id: true } },
          },
        },
      },
    });
    if (!request) throw new NotFoundApiError("La reunión no existe.");
    await validarGestion(tx, actor, request.docentePrograma.programaId);
    if (request.instancias.some(({ detallesLiquidacion }) => detallesLiquidacion.length > 0)) {
      throw new ConflictApiError("La reunión tiene liquidaciones asociadas y no se puede eliminar.");
    }

    await tx.auditoria.create({
      data: {
        actorUsuarioId: actor.id,
        accion: "REUNION_ELIMINADA",
        entidadTipo: "SolicitudSala",
        entidadId: request.id,
        valorAnterior: {
          titulo: request.titulo,
          encuentros: request.instancias.length,
        },
        valorNuevo: Prisma.JsonNull,
      },
    });

    const eventIds = request.instancias.flatMap(({ eventosProveedor }) =>
      eventosProveedor.filter(({ proveedor }) => proveedor.tipo === "GOOGLE_MEET").map(({ id }) => id)
    );
    await tx.instanciaSala.updateMany({
      where: { solicitudSalaId: request.id },
      data: { estado: "CANCELADA" },
    });
    if (eventIds.length > 0) {
      await tx.eventoProveedor.updateMany({
        where: { id: { in: eventIds } },
        data: {
          estadoIntegracion: "PENDIENTE",
          operacionPendiente: "CANCELAR",
          reclamoIntegracionAt: null,
          reclamoIntegracionToken: null,
          errorIntegracion: null,
        },
      });
    }
    await tx.solicitudSala.update({
      where: { id: request.id },
      data: {
        estado: "CANCELADA",
        canceladaAt: new Date(),
        canceladaMotivo: "Eliminación solicitada; cancelaciones Google pendientes.",
      },
    });
    return { eventoProveedorIds: eventIds };
  });
}

async function cargarEncuentroBloqueado(
  tx: Prisma.TransactionClient,
  solicitudId: string,
  instanciaId: string,
) {
  return tx.instanciaSala.findFirst({
    where: { id: instanciaId, solicitudSalaId: solicitudId },
    include: {
      solicitud: { include: { docentePrograma: { include: { docente: true } } } },
      eventosProveedor: { include: { proveedor: true, cuentaProveedor: true } },
    },
  });
}

async function marcarOperacionPendiente(
  tx: Prisma.TransactionClient,
  eventoProveedorId: string,
  operacionPendiente: "PROVISIONAR" | "REPROGRAMAR" | "CONFIGURAR_MEET" | "CANCELAR",
): Promise<void> {
  await tx.eventoProveedor.update({
    where: { id: eventoProveedorId },
    data: {
      estadoIntegracion: "PENDIENTE",
      operacionPendiente,
      reclamoIntegracionAt: null,
      reclamoIntegracionToken: null,
      errorIntegracion: null,
    },
  });
}

async function validarGestion(
  tx: Prisma.TransactionClient,
  actor: SessionActor,
  programaId?: string
): Promise<void> {
  if (!programaId || !await puedeGestionarPrograma(tx, actor, programaId)) {
    throw new ForbiddenApiError("No tiene permisos para gestionar estos encuentros.");
  }
}

function cohostsComunes(values: readonly (readonly string[])[]): readonly string[] {
  if (values.length === 0) return [];
  return values[0].filter((value) => values.every((current) => current.includes(value)));
}