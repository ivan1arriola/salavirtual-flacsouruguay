import { Prisma, type PrismaClient } from "@prisma/client";
import { idsCancelacionesGooglePendientes } from "./encuentros.domain";
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
  modalidadEfectivaEncuentro,
  periodoAsistenciaTecnica,
  puedeCorregirModalidadHistorica,
} from "./encuentros.domain";
import { bloquearReservaSalas, bloquearSolicitudSala } from "./reserva-salas.adapter";
import { pertenecenAlMismoDia } from "./periodos.domain";
import { auditarEncuentro as auditar, recalcularSolicitud } from "./encuentros-persistence.adapter";
import { puedeGestionarPrograma } from "./permisos-programa.service";
import { reservarAsistenteDisponible } from "../asistencia/reserva-asistencia.service";

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
    validarHorarioAsistenciaTecnica({
      inicioEncuentro: input.inicio,
      finEncuentro: input.fin,
      inicioAsistencia: input.inicioAsistenciaTecnica ?? null,
      finAsistencia: input.finAsistenciaTecnica ?? null,
      modalidad: serie.modalidad,
      requiereAsistenciaTecnica: input.requiereAsistenciaTecnica,
      timezone: serie.timezone,
    });
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
        inicioAsistenciaTecnicaAt: input.inicioAsistenciaTecnica ?? null,
        finAsistenciaTecnicaAt: input.finAsistenciaTecnica ?? null,
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

    if (!input.requiereAsistenciaTecnica) {
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
    const puedeCorregirModalidad = input.accion === "CAMBIAR_MODALIDAD" &&
      puedeCorregirModalidadHistorica(actor.rol, actual.estado);
    if (actual.estado !== "PROGRAMADA" && !puedeCorregirModalidad) {
      throw new ConflictApiError("El encuentro no se puede modificar.");
    }

    const event = actual.eventosProveedor.find(({ proveedor }) => proveedor.tipo === "GOOGLE_MEET");

    if (input.accion === "EDITAR_FECHA" || input.accion === "EDITAR_ENCUENTRO") {
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

      const deltaInicioMs = input.inicio.getTime() - actual.inicioProgramadoAt.getTime();
      const inicioAsistenciaDesplazado = actual.inicioAsistenciaTecnicaAt
        ? new Date(actual.inicioAsistenciaTecnicaAt.getTime() + deltaInicioMs)
        : null;
      const finAsistenciaDesplazado = actual.finAsistenciaTecnicaAt
        ? new Date(actual.finAsistenciaTecnicaAt.getTime() + deltaInicioMs)
        : null;
      validarHorarioAsistenciaTecnica({
        inicioEncuentro: input.inicio,
        finEncuentro: input.fin,
        inicioAsistencia: inicioAsistenciaDesplazado,
        finAsistencia: finAsistenciaDesplazado,
        modalidad: modalidadEfectivaEncuentro(actual.solicitud.modalidad, actual.modalidadOverride),
        requiereAsistenciaTecnica: actual.requiereAsistenciaTecnica,
        timezone: actual.timezone,
      });

      const asignacionActiva = await tx.asignacionAsistenciaTecnica.findFirst({
        where: { instanciaSalaId: actual.id, estado: { in: ["ASIGNADO", "ACEPTADO"] } },
        select: { asistenteTecnicoId: true },
      });
      if (asignacionActiva) {
        const periodo = {
          inicio: inicioAsistenciaDesplazado ?? input.inicio,
          fin: finAsistenciaDesplazado ?? input.fin,
        };
        await reservarAsistenteDisponible(
          tx,
          asignacionActiva.asistenteTecnicoId,
          modalidadEfectivaEncuentro(actual.solicitud.modalidad, actual.modalidadOverride),
          [periodo],
          actual.id,
        );
      }

      await tx.instanciaSala.update({
        where: { id: actual.id },
        data: {
          inicioProgramadoAt: input.inicio,
          finProgramadoAt: input.fin,
          inicioAsistenciaTecnicaAt: inicioAsistenciaDesplazado,
          finAsistenciaTecnicaAt: finAsistenciaDesplazado,
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

    if (input.accion === "CAMBIAR_MODALIDAD") {
      if (actor.rol !== "ADMINISTRACION") {
        throw new ForbiddenApiError("Solo Administración puede cambiar la modalidad de un encuentro puntual.");
      }
      const modalidadAnterior = modalidadEfectivaEncuentro(
        actual.solicitud.modalidad,
        actual.modalidadOverride,
      );
      const modalidadNueva = modalidadEfectivaEncuentro(
        actual.solicitud.modalidad,
        input.modalidad,
      );
      validarHorarioAsistenciaTecnica({
        inicioEncuentro: actual.inicioProgramadoAt,
        finEncuentro: actual.finProgramadoAt,
        inicioAsistencia: actual.inicioAsistenciaTecnicaAt,
        finAsistencia: actual.finAsistenciaTecnicaAt,
        modalidad: modalidadNueva,
        requiereAsistenciaTecnica: actual.requiereAsistenciaTecnica,
        timezone: actual.timezone,
      });

      const asignacion = await tx.asignacionAsistenciaTecnica.findFirst({
        where: { instanciaSalaId: actual.id, estado: { in: ["ASIGNADO", "ACEPTADO"] } },
        select: { id: true, asistenteTecnicoId: true },
      });
      if (asignacion) {
        const periodo = periodoAsistenciaTecnica(actual);
        const { tarifa } = await reservarAsistenteDisponible(
          tx,
          asignacion.asistenteTecnicoId,
          modalidadNueva,
          [periodo],
          actual.id,
        );
        await tx.asignacionAsistenciaTecnica.update({
          where: { id: asignacion.id },
          data: {
            tarifaAsistenciaTecnicaId: tarifa.id,
            tarifaHoraAplicada: tarifa.valorHora,
            moneda: tarifa.moneda,
          },
        });
      }

      await tx.instanciaSala.update({
        where: { id: actual.id },
        data: { modalidadOverride: input.modalidad },
      });
      await auditar(tx, actor.id, "MODALIDAD_ENCUENTRO_CAMBIADA", actual.id, {
        modalidad: modalidadAnterior,
        modalidadOverride: actual.modalidadOverride,
      }, {
        modalidad: modalidadNueva,
        modalidadOverride: input.modalidad,
      });
      return { eventoProveedorIds: [] };
    }

    if (input.accion === "EDITAR_HORARIO_ASISTENCIA") {
      if (actor.rol !== "ADMINISTRACION") {
        throw new ForbiddenApiError("Solo Administración puede modificar el horario de asistencia técnica.");
      }
      const modalidad = modalidadEfectivaEncuentro(
        actual.solicitud.modalidad,
        actual.modalidadOverride,
      );
      validarHorarioAsistenciaTecnica({
        inicioEncuentro: actual.inicioProgramadoAt,
        finEncuentro: actual.finProgramadoAt,
        inicioAsistencia: input.inicioAsistenciaTecnica,
        finAsistencia: input.finAsistenciaTecnica,
        modalidad,
        requiereAsistenciaTecnica: actual.requiereAsistenciaTecnica,
        timezone: actual.timezone,
      });

      const asignacion = await tx.asignacionAsistenciaTecnica.findFirst({
        where: { instanciaSalaId: actual.id, estado: { in: ["ASIGNADO", "ACEPTADO"] } },
        select: { asistenteTecnicoId: true },
      });
      if (asignacion) {
        await reservarAsistenteDisponible(
          tx,
          asignacion.asistenteTecnicoId,
          modalidad,
          [{
            inicio: input.inicioAsistenciaTecnica,
            fin: input.finAsistenciaTecnica,
          }],
          actual.id,
        );
      }

      await tx.instanciaSala.update({
        where: { id: actual.id },
        data: {
          inicioAsistenciaTecnicaAt: input.inicioAsistenciaTecnica,
          finAsistenciaTecnicaAt: input.finAsistenciaTecnica,
        },
      });
      await auditar(tx, actor.id, "HORARIO_ASISTENCIA_TECNICA_CAMBIADO", actual.id, {
        inicio: actual.inicioAsistenciaTecnicaAt?.toISOString() ?? null,
        fin: actual.finAsistenciaTecnicaAt?.toISOString() ?? null,
      }, {
        inicio: input.inicioAsistenciaTecnica.toISOString(),
        fin: input.finAsistenciaTecnica.toISOString(),
      });
      return { eventoProveedorIds: [] };
    }

    if (input.accion === "RESTABLECER_HORARIO_ASISTENCIA") {
      if (actor.rol !== "ADMINISTRACION") {
        throw new ForbiddenApiError("Solo Administración puede restablecer el horario de asistencia técnica.");
      }
      const inicioAsistenciaTecnica = actual.solicitud.inicioAsistenciaTecnicaAt;
      const finAsistenciaTecnica = actual.solicitud.finAsistenciaTecnicaAt;
      if (!inicioAsistenciaTecnica || !finAsistenciaTecnica) {
        throw new ConflictApiError("Esta serie no tiene un horario base de asistencia técnica para restablecer.");
      }
      const modalidad = modalidadEfectivaEncuentro(
        actual.solicitud.modalidad,
        actual.modalidadOverride,
      );
      validarHorarioAsistenciaTecnica({
        inicioEncuentro: actual.inicioProgramadoAt,
        finEncuentro: actual.finProgramadoAt,
        inicioAsistencia: inicioAsistenciaTecnica,
        finAsistencia: finAsistenciaTecnica,
        modalidad,
        requiereAsistenciaTecnica: actual.requiereAsistenciaTecnica,
        timezone: actual.timezone,
      });

      const asignacion = await tx.asignacionAsistenciaTecnica.findFirst({
        where: { instanciaSalaId: actual.id, estado: { in: ["ASIGNADO", "ACEPTADO"] } },
        select: { asistenteTecnicoId: true },
      });
      if (asignacion) {
        await reservarAsistenteDisponible(
          tx,
          asignacion.asistenteTecnicoId,
          modalidad,
          [{ inicio: inicioAsistenciaTecnica, fin: finAsistenciaTecnica }],
          actual.id,
        );
      }

      await tx.instanciaSala.update({
        where: { id: actual.id },
        data: {
          inicioAsistenciaTecnicaAt: inicioAsistenciaTecnica,
          finAsistenciaTecnicaAt: finAsistenciaTecnica,
        },
      });
      await auditar(tx, actor.id, "HORARIO_ASISTENCIA_TECNICA_RESTABLECIDO", actual.id, {
        inicio: actual.inicioAsistenciaTecnicaAt?.toISOString() ?? null,
        fin: actual.finAsistenciaTecnicaAt?.toISOString() ?? null,
      }, {
        inicio: inicioAsistenciaTecnica.toISOString(),
        fin: finAsistenciaTecnica.toISOString(),
      });
      return { eventoProveedorIds: [] };
    }

    if (input.accion !== "CAMBIAR_ASISTENCIA") {
      throw new ValidationApiError("La acción del encuentro no pudo ser procesada.");
    }
    if (input.requiereAsistenciaTecnica) {
      validarHorarioAsistenciaTecnica({
        inicioEncuentro: actual.inicioProgramadoAt,
        finEncuentro: actual.finProgramadoAt,
        inicioAsistencia: actual.inicioAsistenciaTecnicaAt,
        finAsistencia: actual.finAsistenciaTecnicaAt,
        modalidad: modalidadEfectivaEncuentro(actual.solicitud.modalidad, actual.modalidadOverride),
        requiereAsistenciaTecnica: true,
        timezone: actual.timezone,
      });
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
    // A repeated DELETE must not requeue already synchronized Google deletions
    // or create duplicate audit records.
    if (request.estado === "CANCELADA") {
      return {
        eventoProveedorIds: idsCancelacionesGooglePendientes(request.instancias)
      };
    }
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

function validarHorarioAsistenciaTecnica(input: Readonly<{
  inicioEncuentro: Date;
  finEncuentro: Date;
  inicioAsistencia: Date | null;
  finAsistencia: Date | null;
  modalidad: "HIBRIDA" | "VIRTUAL";
  requiereAsistenciaTecnica: boolean;
  timezone: string;
}>): void {
  const {
    inicioEncuentro,
    finEncuentro,
    inicioAsistencia,
    finAsistencia,
    modalidad,
    requiereAsistenciaTecnica,
    timezone,
  } = input;

  if (Boolean(inicioAsistencia) !== Boolean(finAsistencia)) {
    throw new ValidationApiError("La hora de llegada y salida del asistente deben definirse juntas.");
  }
  if (!inicioAsistencia || !finAsistencia) {
    if (requiereAsistenciaTecnica && modalidad === "HIBRIDA") {
      throw new ValidationApiError(
        "Las reuniones híbridas con asistencia técnica requieren hora exacta de llegada y salida.",
      );
    }
    return;
  }
  if (finAsistencia <= inicioAsistencia) {
    throw new ValidationApiError("La hora de salida del asistente debe ser posterior a la de llegada.");
  }
  if (
    !pertenecenAlMismoDia(inicioAsistencia, inicioEncuentro, timezone) ||
    !pertenecenAlMismoDia(finAsistencia, finEncuentro, timezone)
  ) {
    throw new ValidationApiError("El horario de asistencia técnica debe pertenecer al mismo día del encuentro.");
  }
  if (inicioAsistencia > inicioEncuentro || finAsistencia < finEncuentro) {
    throw new ValidationApiError("El horario de asistencia técnica debe cubrir todo el encuentro.");
  }
  if (
    requiereAsistenciaTecnica &&
    modalidad === "HIBRIDA" &&
    (inicioAsistencia >= inicioEncuentro || finAsistencia <= finEncuentro)
  ) {
    throw new ValidationApiError(
      "En una reunión híbrida el asistente debe llegar antes del inicio y retirarse después del fin.",
    );
  }
}

function cohostsComunes(values: readonly (readonly string[])[]): readonly string[] {
  if (values.length === 0) return [];
  return values[0].filter((value) => values.every((current) => current.includes(value)));
}
