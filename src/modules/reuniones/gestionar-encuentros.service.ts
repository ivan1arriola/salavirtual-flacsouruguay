import type { PrismaClient } from "@prisma/client";
import type { SessionActor } from "@/src/lib/auth/session-actor.adapter";
import type { GoogleCalendarCredentials } from "../meet/google-calendar.adapter";
import type { MeetProvider } from "../meet/provider";
import {
  actualizarEncuentroSchema,
  agregarEncuentroSchema,
  elegirCuentaHost,
  puedeGestionarEncuentros
} from "./encuentros.domain";
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
    settings: Readonly<{ requiereAsistencia?: boolean }>
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
      instancias: { include: { eventosProveedor: true }, orderBy: { ordinal: "asc" } }
    }
  });
  validarGestion(actor, request?.docentePrograma.docente.usuarioId);
  if (!request || input.inicio <= new Date()) throw new Error("El encuentro debe comenzar en el futuro.");

  const provider = await dependencies.db.proveedorReunion.findUnique({ where: { tipo: "GOOGLE_MEET" } });
  if (!provider) throw new Error("Google Meet no está configurado como proveedor.");
  const preferredHost = request.instancias.flatMap(({ eventosProveedor }) =>
    eventosProveedor.flatMap(({ cuentaProveedorId }) => cuentaProveedorId ? [cuentaProveedorId] : [])
  )[0] ?? null;
  const [hosts, conflicts] = await Promise.all([
    dependencies.db.cuentaProveedor.findMany({
      where: { proveedorId: provider.id, activa: true, tieneLicencia: true },
      orderBy: { prioridad: "asc" },
      select: { id: true, prioridad: true }
    }),
    dependencies.db.eventoProveedor.findMany({
      where: {
        proveedorId: provider.id,
        cuentaProveedorId: { not: null },
        instancia: {
          estado: "PROGRAMADA",
          inicioProgramadoAt: { lt: input.fin },
          finProgramadoAt: { gt: input.inicio }
        }
      },
      select: { cuentaProveedorId: true }
    })
  ]);
  const hostId = elegirCuentaHost(
    preferredHost,
    hosts,
    conflicts.flatMap(({ cuentaProveedorId }) => cuentaProveedorId ? [cuentaProveedorId] : [])
  );
  if (!hostId) throw new Error("No hay una sala Meet libre para ese horario.");

  return dependencies.db.$transaction(async (tx) => {
    const ordinal = (request.instancias.reduce((max, item) => Math.max(max, item.ordinal), 0)) + 1;
    const meeting = await tx.instanciaSala.create({
      data: {
        solicitudSalaId: request.id,
        ordinal,
        inicioProgramadoAt: input.inicio,
        finProgramadoAt: input.fin,
        timezone: request.timezone,
        requiereAsistencia: input.requiereAsistencia,
        requiereGrabacion: input.requiereGrabacion
      }
    });
    const event = await tx.eventoProveedor.create({
      data: { instanciaSalaId: meeting.id, proveedorId: provider.id, cuentaProveedorId: hostId }
    });
    await recalcularSolicitud(tx, request.id);
    await auditar(tx, actor.id, "ENCUENTRO_AGREGADO", meeting.id, null, {
      inicio: input.inicio.toISOString(),
      fin: input.fin.toISOString(),
      requiereAsistencia: input.requiereAsistencia,
      requiereGrabacion: input.requiereGrabacion
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
  const credentials = event?.externalEventId || event?.codigoReunion
    ? await cargarCredencialesEncuentro(
        dependencies.db,
        dependencies.descifrar,
        event.cuentaProveedor?.emailOrganizador
      )
    : null;

  if (input.accion === "EDITAR_FECHA") {
    if (input.inicio <= new Date()) throw new Error("El encuentro debe comenzar en el futuro.");
    if (event?.cuentaProveedorId) {
      const conflict = await dependencies.db.eventoProveedor.findFirst({
        where: {
          id: { not: event.id },
          cuentaProveedorId: event.cuentaProveedorId,
          instancia: {
            estado: "PROGRAMADA",
            inicioProgramadoAt: { lt: input.fin },
            finProgramadoAt: { gt: input.inicio }
          }
        },
        select: { id: true }
      });
      if (conflict) throw new Error("La sala Meet ya está ocupada en ese horario.");
    }
    if (event?.externalEventId && event.cuentaProveedor?.emailOrganizador && credentials) {
      await dependencies.crearProvider(credentials).actualizarEvento(
        event.cuentaProveedor.emailOrganizador,
        event.externalEventId,
        {
          titulo: meeting.solicitud.titulo,
          descripcion: meeting.solicitud.descripcion ?? undefined,
          inicio: input.inicio,
          fin: input.fin,
          timezone: meeting.timezone
        }
      );
    }
    await dependencies.db.$transaction(async (tx) => {
      await tx.instanciaSala.update({
        where: { id: meeting.id },
        data: { inicioProgramadoAt: input.inicio, finProgramadoAt: input.fin }
      });
      await recalcularSolicitud(tx, solicitudId);
      await auditar(tx, actor.id, "ENCUENTRO_REPROGRAMADO", meeting.id, {
        inicio: meeting.inicioProgramadoAt.toISOString(),
        fin: meeting.finProgramadoAt.toISOString()
      }, { inicio: input.inicio.toISOString(), fin: input.fin.toISOString() });
    });
    return;
  }

  if (event?.codigoReunion && credentials) {
    await dependencies.configurarEspacio(credentials, event.codigoReunion, {
      requiereAsistencia: input.requiereAsistencia
    });
  }
  await dependencies.db.$transaction(async (tx) => {
    await tx.instanciaSala.update({
      where: { id: meeting.id },
      data: { requiereAsistencia: input.requiereAsistencia }
    });
    if (!input.requiereAsistencia) {
      await Promise.all([
        tx.asignacionAsistente.updateMany({
          where: { instanciaSalaId: meeting.id, estado: { in: ["ASIGNADO", "ACEPTADO"] } },
          data: { estado: "CANCELADO" }
        }),
        tx.interesAsistenteEvento.updateMany({
          where: { instanciaSalaId: meeting.id, estado: "ME_INTERESA" },
          data: { estado: "RETIRADO" }
        })
      ]);
    }
    await recalcularSolicitud(tx, solicitudId);
    await auditar(tx, actor.id, input.requiereAsistencia ? "ASISTENCIA_SOLICITADA" : "ASISTENCIA_CANCELADA", meeting.id, {
      requiereAsistencia: meeting.requiereAsistencia
    }, { requiereAsistencia: input.requiereAsistencia });
  });
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
    await dependencies.crearProvider(credentials).cancelarEvento(
      event.cuentaProveedor.emailOrganizador,
      event.externalEventId
    );
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

function validarGestion(actor: SessionActor, docenteUsuarioId?: string): void {
  if (!actor.activo || !docenteUsuarioId || !puedeGestionarEncuentros(actor.rol, actor.id, docenteUsuarioId)) {
    throw new Error("No tiene permisos para gestionar estos encuentros.");
  }
}
