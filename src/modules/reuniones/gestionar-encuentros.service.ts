import { Prisma, type PrismaClient } from "@prisma/client";
import type { SessionActor } from "@/src/lib/auth/session-actor.adapter";
import { withRequiredCohostEmails } from "../meet/cohosts.domain";
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
    const hostId = elegirCuentaHostParaPeriodos(
      preferredHost,
      preferredHost ? hosts.filter(({ id }) => id === preferredHost) : hosts,
      conflicts.flatMap(({ cuentaProveedorId, instancia }) => cuentaProveedorId ? [{
        cuentaProveedorId,
        inicio: instancia.inicioProgramadoAt,
        fin: instancia.finProgramadoAt
      }] : []),
      [input]
    );
    if (!hostId) {
      throw new Error(preferredHost
        ? "La sala de esta serie no está disponible en ese horario."
        : "No hay una sala Meet libre para ese horario.");
    }

    const ordinal = (request.instancias.reduce((max, item) => Math.max(max, item.ordinal), 0)) + 1;
    const meeting = await tx.instanciaSala.create({
      data: {
        solicitudSalaId: request.id,
        ordinal,
        descripcion: input.descripcion || request.descripcion,
        inicioProgramadoAt: input.inicio,
        finProgramadoAt: input.fin,
        timezone: request.timezone,
        requiereAsistenciaTecnica: input.requiereAsistenciaTecnica,
        requiereGrabacion: input.requiereGrabacion
      }
    });
    const event = await tx.eventoProveedor.create({
      data: { instanciaSalaId: meeting.id, proveedorId: provider.id, cuentaProveedorId: hostId }
    });
    const cohostIds = request.instancias[0]?.cohosts.map(({ cuentaGoogleId }) => cuentaGoogleId) ?? [];
    if (cohostIds.length) {
      await tx.cohostReunion.createMany({
        data: cohostIds.map((cuentaGoogleId) => ({ instanciaSalaId: meeting.id, cuentaGoogleId }))
      });
    }
    const cohostEmails = withRequiredCohostEmails(
      request.instancias[0]?.cohostEmails.map(({ email }) => email) ?? []
    );
    if (cohostEmails.length) {
      await tx.cohostEmailReunion.createMany({
        data: cohostEmails.map((email) => ({ instanciaSalaId: meeting.id, email }))
      });
    }
    await recalcularSolicitud(tx, request.id);
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
      if (event?.externalEventId && event.cuentaProveedor?.emailOrganizador) {
        const credentials = await cargarCredencialesEncuentro(
          dependencies.db,
          dependencies.descifrar,
          event.cuentaProveedor.emailOrganizador
        );
        await dependencies.crearProvider(credentials).actualizarEvento(
          event.cuentaProveedor.emailOrganizador,
          event.externalEventId,
          {
            titulo: meeting.solicitud.titulo,
            descripcion: input.descripcion ?? meeting.descripcion ?? meeting.solicitud.descripcion ?? "",
            inicio: input.inicio,
            fin: input.fin,
            timezone: meeting.timezone
          }
        );
      }
      await tx.instanciaSala.update({
        where: { id: meeting.id },
        data: {
          inicioProgramadoAt: input.inicio,
          finProgramadoAt: input.fin,
          ...(input.descripcion !== undefined ? { descripcion: input.descripcion || null } : {})
        }
      });
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
    return { warning: null };
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
    return { warning: null };
  } catch (error) {
    const detail = error instanceof Error ? error.message : "Error desconocido de Google Workspace.";
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
  const event = meeting.eventosProveedor.find(({ proveedor }) => proveedor.tipo === "GOOGLE_MEET");
  if (event?.externalEventId && event.cuentaProveedor?.emailOrganizador) {
    const credentials = await cargarCredencialesEncuentro(
      dependencies.db,
      dependencies.descifrar,
      event.cuentaProveedor.emailOrganizador
    );
    try {
      await dependencies.crearProvider(credentials).cancelarEvento(
        event.cuentaProveedor.emailOrganizador,
        event.externalEventId
      );
    } catch (error) {
      if (!esEventoCalendarInexistente(error)) throw error;
    }
  }
  await dependencies.db.$transaction(async (tx) => {
    await auditar(tx, actor.id, "ENCUENTRO_ELIMINADO", meeting.id, {
      inicio: meeting.inicioProgramadoAt.toISOString(),
      fin: meeting.finProgramadoAt.toISOString()
    }, null);
    await tx.instanciaSala.delete({ where: { id: meeting.id } });
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

  const calendarEvents = request.instancias.flatMap(({ eventosProveedor }) =>
    eventosProveedor.flatMap((event) =>
      event.proveedor.tipo === "GOOGLE_MEET" &&
      event.externalEventId &&
      event.cuentaProveedor?.emailOrganizador
        ? [{
            calendarId: event.cuentaProveedor.emailOrganizador,
            externalEventId: event.externalEventId
          }]
        : []
    )
  );
  const eventosPorCalendario = new Map<string, typeof calendarEvents>();
  for (const event of calendarEvents) {
    eventosPorCalendario.set(event.calendarId, [
      ...(eventosPorCalendario.get(event.calendarId) ?? []),
      event
    ]);
  }
  for (const [calendarId, events] of eventosPorCalendario) {
    const credentials = await cargarCredencialesEncuentro(
      dependencies.db,
      dependencies.descifrar,
      calendarId
    );
    const provider = dependencies.crearProvider(credentials);
    for (const { externalEventId } of events) {
      try {
        await conReintentosPorLimiteGoogle(() =>
          provider.cancelarEvento(calendarId, externalEventId)
        );
      } catch (error) {
        if (!esEventoCalendarInexistente(error)) throw error;
      }
    }
  }

  await dependencies.db.$transaction(async (tx) => {
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
    await tx.solicitudSala.delete({ where: { id: request.id } });
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
