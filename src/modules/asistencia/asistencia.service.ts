import { ConflictApiError, ForbiddenApiError, ValidationApiError } from "@/src/lib/http/api-error";
import type { GoogleCalendarCredentials } from "@/src/modules/conferencias/api";
import type { PrismaClient } from "@prisma/client";
import {
  disponibilidadSemanalSchema,
  estadoInteresParaAccion,
  notificacionAsistenciaSchema,
  puedeAsignarAsistencia,
  puedeGestionarPostulacion,
  postulacionAsistenciaSchema
} from "./asistencia.domain";
import type { SessionActor } from "@/src/lib/auth/session-actor.adapter";
import { cargarCredencialesEncuentro } from "../reuniones/encuentros-persistence.adapter";
import { notificarUsuarios } from "../notificaciones/notificaciones.service";
import { sincronizarCohostsDeInstanciaUseCase } from "./application/sincronizar-cohosts-asistencia.use-case";

const ACTIVE_ASSIGNMENTS = ["ASIGNADO", "ACEPTADO"] as const;

export type SincronizarCohostsDependencies = Readonly<{
  db: PrismaClient;
  descifrar: (value: string) => string;
  configurarEspacio: (
    credentials: GoogleCalendarCredentials,
    codigoReunion: string,
    settings: Readonly<{ cohostEmails?: readonly string[] }>
  ) => Promise<void>;
}>;

export async function actualizarPostulacionAsistencia(
  db: PrismaClient,
  actor: SessionActor,
  rawInput: unknown
) {
  if (!puedeGestionarPostulacion(actor.rol) || !actor.activo) {
    throw new ForbiddenApiError("Solo un asistente de monitoreo puede gestionar postulaciones.");
  }
  const input = postulacionAsistenciaSchema.parse(rawInput);

  const result = await db.$transaction(async (tx) => {
    const assistant = await tx.asistenteTecnico.findUnique({
      where: { usuarioId: actor.id },
      select: {
        id: true,
        cesadoHastaProximoInicioSesion: true,
        usuario: { select: { activo: true, rol: true, nombres: true, apellidos: true } }
      }
    });
    if (
      !assistant?.usuario.activo ||
      assistant.usuario.rol !== "ASISTENTE_TECNICO" ||
      assistant.cesadoHastaProximoInicioSesion
    ) {
      throw new ForbiddenApiError("No existe un perfil de asistente de monitoreo activo para esta sesión.");
    }
    const meeting = await tx.instanciaSala.findUnique({
      where: { id: input.instanciaSalaId },
      select: {
        id: true,
        requiereAsistenciaTecnica: true,
        finProgramadoAt: true,
        estado: true,
        solicitud: { select: { titulo: true } },
        asignaciones: {
          where: { estado: { in: [...ACTIVE_ASSIGNMENTS] } },
          select: { id: true },
          take: 1
        }
      }
    });
    if (
      !meeting?.requiereAsistenciaTecnica ||
      meeting.estado !== "PROGRAMADA" ||
      meeting.finProgramadoAt <= new Date()
    ) {
      throw new ConflictApiError("La reunión no está abierta para postulaciones.");
    }
    if (meeting.asignaciones.length > 0) {
      throw new ConflictApiError("La reunión ya tiene una persona asignada.");
    }

    const estado = estadoInteresParaAccion(input.accion);
    const assistantName =
      [assistant.usuario.nombres, assistant.usuario.apellidos].filter(Boolean).join(" ") ||
      "Un asistente de monitoreo";
    const interest = await tx.postulacionAsistenciaTecnica.upsert({
      where: {
        instanciaSalaId_asistenteTecnicoId: {
          instanciaSalaId: meeting.id,
          asistenteTecnicoId: assistant.id
        }
      },
      create: {
        instanciaSalaId: meeting.id,
        asistenteTecnicoId: assistant.id,
        estado,
        comentario: input.comentario
      },
      update: { estado, comentario: input.comentario },
      select: { id: true, estado: true }
    });
    await tx.auditoria.create({
      data: {
        actorUsuarioId: actor.id,
        accion: estado === "ME_INTERESA" ? "ASISTENTE_POSTULADO" : "POSTULACION_RETIRADA",
        entidadTipo: "InstanciaSala",
        entidadId: meeting.id,
        valorNuevo: { asistenteTecnicoId: assistant.id, estado }
      }
    });
    const admins = await tx.usuario.findMany({
      where: { activo: true, rol: "ADMINISTRACION" },
      select: { id: true, emailPrincipal: true }
    });
    const notificationType =
      estado === "ME_INTERESA"
        ? ("ASISTENCIA_POSTULACION" as const)
        : ("ASISTENCIA_POSTULACION_RETIRADA" as const);
    return {
      interest,
      notification: {
        recipients: admins.map((admin) => ({ usuarioId: admin.id, email: admin.emailPrincipal })),
        message: {
          tipo: notificationType,
          titulo: estado === "ME_INTERESA" ? "Nueva postulación de monitoreo" : "Postulación retirada",
          cuerpo: `${assistantName} ${estado === "ME_INTERESA" ? "se postuló a" : "retiró su postulación de"} ${meeting.solicitud.titulo}.`,
          href: "/monitoreo?estado=pendientes",
          metadata: { instanciaSalaId: meeting.id, asistenteTecnicoId: assistant.id, estado },
          emailSubject:
            estado === "ME_INTERESA" ? "Nueva postulación de monitoreo" : "Postulación de monitoreo retirada"
        }
      }
    };
  });
  await safelyNotify(() =>
    notificarUsuarios(db, result.notification.recipients, result.notification.message)
  );
  return result.interest;
}

export async function renotificarAsistentesDisponibles(
  db: PrismaClient,
  actor: SessionActor,
  rawInput: unknown
): Promise<number> {
  if (!puedeAsignarAsistencia(actor.rol) || !actor.activo) {
    throw new ForbiddenApiError("Solo Administración puede volver a notificar asistentes de monitoreo.");
  }
  const input = notificacionAsistenciaSchema.parse(rawInput);
  const result = await db.$transaction(async (tx) => {
    const [admin, meeting, assistants] = await Promise.all([
      tx.usuario.findUnique({ where: { id: actor.id }, select: { activo: true, rol: true } }),
      tx.instanciaSala.findUnique({
        where: { id: input.instanciaSalaId },
        select: {
          id: true,
          requiereAsistenciaTecnica: true,
          estado: true,
          finProgramadoAt: true,
          inicioProgramadoAt: true,
          solicitud: {
            select: {
              titulo: true,
              docentePrograma: { select: { programa: { select: { nombre: true } } } }
            }
          },
          asignaciones: {
            where: { estado: { in: [...ACTIVE_ASSIGNMENTS] } },
            select: { id: true },
            take: 1
          }
        }
      }),
      tx.asistenteTecnico.findMany({
        where: {
          disponibleGeneral: true,
          cesadoHastaProximoInicioSesion: false,
          usuario: { activo: true, rol: "ASISTENTE_TECNICO" }
        },
        select: { usuario: { select: { id: true, emailPrincipal: true } } }
      })
    ]);
    if (!admin?.activo || !puedeAsignarAsistencia(admin.rol)) {
      throw new ForbiddenApiError("La sesión de Administración ya no es válida.");
    }
    if (
      !meeting?.requiereAsistenciaTecnica ||
      meeting.estado !== "PROGRAMADA" ||
      meeting.finProgramadoAt <= new Date()
    ) {
      throw new ConflictApiError("La reunión ya no necesita cobertura de monitoreo.");
    }
    if (meeting.asignaciones.length > 0) {
      throw new ConflictApiError("La reunión ya tiene una persona asignada.");
    }
    await tx.auditoria.create({
      data: {
        actorUsuarioId: actor.id,
        accion: "ASISTENTES_RENOTIFICADOS",
        entidadTipo: "InstanciaSala",
        entidadId: meeting.id,
        valorNuevo: { destinatarios: assistants.length }
      }
    });
    return {
      recipients: assistants.map(({ usuario }) => ({ usuarioId: usuario.id, email: usuario.emailPrincipal })),
      message: {
        tipo: "ASISTENCIA_REQUERIDA" as const,
        titulo: "Cobertura de monitoreo disponible",
        cuerpo: `${meeting.solicitud.titulo} (${meeting.solicitud.docentePrograma.programa.nombre}) necesita monitoreo.`,
        href: "/agenda-abierta",
        metadata: {
          instanciaSalaId: meeting.id,
          inicioProgramadoAt: meeting.inicioProgramadoAt.toISOString()
        },
        emailSubject: `Recordatorio de cobertura de monitoreo disponible: ${meeting.solicitud.titulo}`,
        emailText: `La reunión "${meeting.solicitud.titulo}" (${meeting.solicitud.docentePrograma.programa.nombre}) requiere monitoreo y está disponible para postularse en Agenda abierta.\n\nAl asignarte la reunión, tu cuenta de Google será configurada automáticamente como anfitriona en Google Meet para que ingreses directamente a brindar soporte y moderación sin requerir credenciales de sala.`,
        emailActionLabel: "Ver agenda abierta"
      }
    };
  });
  await safelyNotify(() => notificarUsuarios(db, result.recipients, result.message));
  return result.recipients.length;
}

export async function actualizarDisponibilidadSemanal(
  db: PrismaClient,
  actor: SessionActor,
  rawInput: unknown
): Promise<void> {
  if (!actor.activo || actor.rol !== "ASISTENTE_TECNICO") {
    throw new ForbiddenApiError("Solo un asistente de monitoreo puede gestionar su disponibilidad.");
  }
  const input = disponibilidadSemanalSchema.parse(rawInput);
  if (new Set(input.franjas.map(({ diaSemana }) => diaSemana)).size !== input.franjas.length) {
    throw new ValidationApiError("Solo puede definirse una franja habitual por día.");
  }
  await db.$transaction(async (tx) => {
    const assistant = await tx.asistenteTecnico.findUnique({
      where: { usuarioId: actor.id },
      select: { id: true }
    });
    if (!assistant) {
      throw new ForbiddenApiError("No existe un perfil de asistente de monitoreo para esta sesión.");
    }
    await tx.asistenteTecnico.update({
      where: { id: assistant.id },
      data: { disponibleGeneral: input.disponibleGeneral }
    });
    await tx.disponibilidadAsistenteTecnico.deleteMany({
      where: { asistenteTecnicoId: assistant.id, fecha: null }
    });
    if (input.franjas.length > 0) {
      await tx.disponibilidadAsistenteTecnico.createMany({
        data: input.franjas.map((franja) => ({
          asistenteTecnicoId: assistant.id,
          ...franja,
          fecha: null,
          timezone: "America/Montevideo"
        }))
      });
    }
    await tx.auditoria.create({
      data: {
        actorUsuarioId: actor.id,
        accion: "DISPONIBILIDAD_ACTUALIZADA",
        entidadTipo: "AsistenteTecnico",
        entidadId: assistant.id,
        valorNuevo: {
          disponibleGeneral: input.disponibleGeneral,
          franjas: input.franjas
        }
      }
    });
  });
}

async function safelyNotify(action: () => Promise<void>): Promise<void> {
  try {
    await action();
  } catch (error) {
    console.warn("La operacion se completo, pero no se pudo generar una notificacion", error);
  }
}

export async function sincronizarCohostsDeInstancia(
  dependencies: SincronizarCohostsDependencies,
  instanciaSalaId: string
): Promise<void> {
  return sincronizarCohostsDeInstanciaUseCase(
    {
      db: dependencies.db,
      descifrar: dependencies.descifrar,
      cargarCredencialesEncuentro,
      configurarEspacio: dependencies.configurarEspacio
    },
    instanciaSalaId
  );
}
