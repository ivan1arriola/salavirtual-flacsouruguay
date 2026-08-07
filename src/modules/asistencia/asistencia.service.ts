import type { PrismaClient } from "@prisma/client";
import { withRequiredCohostEmails } from "../meet/cohosts.domain";
import type { GoogleCalendarCredentials } from "../meet/google-calendar.adapter";
import {
  asignacionAsistenciaSchema,
  disponibilidadSemanalSchema,
  estadoInteresParaAccion,
  estadoParaRespuestaAsignacion,
  puedeAsignarAsistencia,
  puedeGestionarPostulacion,
  postulacionAsistenciaSchema,
  respuestaAsignacionSchema
} from "./asistencia.domain";
import type { SessionActor } from "@/src/lib/auth/session-actor.adapter";
import { cargarCredencialesEncuentro } from "../reuniones/encuentros-persistence.adapter";
import { notificarUsuario, notificarUsuarios } from "../notificaciones/notificaciones.service";

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
    throw new Error("Solo Asistente puede gestionar postulaciones.");
  }
  const input = postulacionAsistenciaSchema.parse(rawInput);

  const result = await db.$transaction(async (tx) => {
    const assistant = await tx.asistente.findUnique({
      where: { usuarioId: actor.id },
      select: { id: true, usuario: { select: { activo: true, rol: true, nombres: true, apellidos: true } } }
    });
    if (!assistant?.usuario.activo || assistant.usuario.rol !== "ASISTENTE") {
      throw new Error("No existe un perfil de Asistente activo para esta sesión.");
    }
    const meeting = await tx.instanciaSala.findUnique({
      where: { id: input.instanciaSalaId },
      select: {
        id: true,
        requiereAsistencia: true,
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
      !meeting?.requiereAsistencia ||
      meeting.estado !== "PROGRAMADA" ||
      meeting.finProgramadoAt <= new Date()
    ) {
      throw new Error("La reunión no está abierta para postulaciones.");
    }
    if (meeting.asignaciones.length > 0) {
      throw new Error("La reunión ya tiene una persona asignada.");
    }

    const estado = estadoInteresParaAccion(input.accion);
    const assistantName = [
      assistant.usuario.nombres,
      assistant.usuario.apellidos
    ].filter(Boolean).join(" ") || "Un asistente";
    const interest = await tx.interesAsistenteEvento.upsert({
      where: {
        instanciaSalaId_asistenteId: {
          instanciaSalaId: meeting.id,
          asistenteId: assistant.id
        }
      },
      create: {
        instanciaSalaId: meeting.id,
        asistenteId: assistant.id,
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
        valorNuevo: { asistenteId: assistant.id, estado }
      }
    });
    const admins = await tx.usuario.findMany({
      where: { activo: true, rol: "ADMINISTRACION" },
      select: { id: true, emailPrincipal: true }
    });
    const notificationType = estado === "ME_INTERESA"
      ? "ASISTENCIA_POSTULACION" as const
      : "ASISTENCIA_POSTULACION_RETIRADA" as const;
    return {
      interest,
      notification: {
        recipients: admins.map((admin) => ({ usuarioId: admin.id, email: admin.emailPrincipal })),
        message: {
          tipo: notificationType,
          titulo: estado === "ME_INTERESA" ? "Nueva postulacion de asistencia" : "Postulacion retirada",
          cuerpo: `${assistantName} ${estado === "ME_INTERESA" ? "se postulo a" : "retiro su postulacion de"} ${meeting.solicitud.titulo}.`,
          href: "/cobertura-asistencias?estado=pendientes",
          metadata: { instanciaSalaId: meeting.id, asistenteId: assistant.id, estado },
          emailSubject: estado === "ME_INTERESA"
            ? "Nueva postulacion de asistencia"
            : "Postulacion de asistencia retirada"
        }
      }
    };
  });
  await safelyNotify(() => notificarUsuarios(db, result.notification.recipients, result.notification.message));
  return result.interest;
}

export async function asignarAsistentePostulado(
  db: PrismaClient,
  actor: SessionActor,
  rawInput: unknown
) {
  if (!puedeAsignarAsistencia(actor.rol) || !actor.activo) {
    throw new Error("Solo Administracion puede asignar asistentes.");
  }
  const input = asignacionAsistenciaSchema.parse(rawInput);

  const result = await db.$transaction(async (tx) => {
    const [admin, meeting, assistant] = await Promise.all([
      tx.usuario.findUnique({
        where: { id: actor.id },
        select: { id: true, activo: true, rol: true }
      }),
      tx.instanciaSala.findUnique({
        where: { id: input.instanciaSalaId },
        select: {
          id: true,
          requiereAsistencia: true,
          finProgramadoAt: true,
          estado: true,
          inicioProgramadoAt: true,
          solicitud: {
            select: {
              id: true,
              titulo: true,
              creadaPor: { select: { id: true, emailPrincipal: true } },
              docentePrograma: {
                select: {
                  docente: {
                    select: {
                      usuario: { select: { id: true, emailPrincipal: true } }
                    }
                  }
                }
              }
            }
          },
          asignaciones: {
            where: { estado: { in: [...ACTIVE_ASSIGNMENTS] } },
            select: { id: true },
            take: 1
          }
        }
      }),
      tx.asistente.findUnique({
        where: { id: input.asistenteId },
        select: {
          id: true,
          usuario: {
            select: {
              id: true,
              activo: true,
              rol: true,
              nombres: true,
              apellidos: true,
              emailPrincipal: true,
              cuentasGoogle: { select: { id: true } }
            }
          }
        }
      })
    ]);
    if (!admin?.activo || !puedeAsignarAsistencia(admin.rol)) {
      throw new Error("La sesión de Administración ya no es válida.");
    }
    if (
      !meeting?.requiereAsistencia ||
      meeting.estado !== "PROGRAMADA" ||
      meeting.finProgramadoAt <= new Date()
    ) {
      throw new Error("La reunión no admite asignaciones.");
    }
    if (meeting.asignaciones.length > 0) {
      throw new Error("La reunión ya tiene una persona asignada.");
    }
    if (!assistant?.usuario.activo || assistant.usuario.rol !== "ASISTENTE") {
      throw new Error("El perfil seleccionado no corresponde a un Asistente activo.");
    }
    const assignment = await tx.asignacionAsistente.upsert({
      where: {
        instanciaSalaId_asistenteId: {
          instanciaSalaId: meeting.id,
          asistenteId: assistant.id
        }
      },
      create: {
        instanciaSalaId: meeting.id,
        asistenteId: assistant.id,
        estado: "ASIGNADO"
      },
      update: { estado: "ASIGNADO" },
      select: { id: true, estado: true, instanciaSalaId: true }
    });
    if (assistant.usuario.cuentasGoogle.length > 0) {
      await tx.cohostReunion.createMany({
        data: assistant.usuario.cuentasGoogle.map(({ id }) => ({
          instanciaSalaId: meeting.id,
          cuentaGoogleId: id
        })),
        skipDuplicates: true
      });
    }
    await tx.auditoria.create({
      data: {
        actorUsuarioId: admin.id,
        accion: "ASISTENTE_ASIGNADO",
        entidadTipo: "InstanciaSala",
        entidadId: meeting.id,
        valorNuevo: { asistenteId: assistant.id, estado: assignment.estado }
      }
    });
    const assignmentMessage = {
      tipo: "ASISTENCIA_ASIGNACION" as const,
      titulo: "Asistencia asignada",
      cuerpo: `${meeting.solicitud.titulo} quedo asignada a ${[
        assistant.usuario.nombres,
        assistant.usuario.apellidos
      ].filter(Boolean).join(" ") || "la persona asignada"}.`,
      href: "/mi-agenda",
      metadata: {
        instanciaSalaId: meeting.id,
        asistenteId: assistant.id,
        inicioProgramadoAt: meeting.inicioProgramadoAt.toISOString()
      }
    };
    return {
      assignment,
      assistantNotification: {
        recipient: {
          usuarioId: assistant.usuario.id,
          email: assistant.usuario.emailPrincipal
        },
        message: {
          ...assignmentMessage,
          titulo: "Te asignaron una reunion",
          cuerpo: `${meeting.solicitud.titulo} quedo asignada a tu agenda de asistencia.`,
          href: "/mi-agenda",
          emailSubject: "Te asignaron una asistencia"
        }
      },
      responsibleNotification: {
        recipients: [
          {
            usuarioId: meeting.solicitud.creadaPor.id,
            email: meeting.solicitud.creadaPor.emailPrincipal
          },
          {
            usuarioId: meeting.solicitud.docentePrograma.docente.usuario.id,
            email: meeting.solicitud.docentePrograma.docente.usuario.emailPrincipal
          }
        ],
        message: {
          ...assignmentMessage,
          href: `/reuniones/${meeting.solicitud.id}`,
          emailSubject: "Asistencia asignada para una reunion"
        }
      }
    };
  });
  await Promise.all([
    safelyNotify(() => notificarUsuario(
      db,
      result.assistantNotification.recipient,
      result.assistantNotification.message
    )),
    safelyNotify(() => notificarUsuarios(
      db,
      result.responsibleNotification.recipients,
      result.responsibleNotification.message
    ))
  ]);
  return result.assignment;
}

export async function responderAsignacionAsistente(
  db: PrismaClient,
  actor: SessionActor,
  rawInput: unknown
) {
  if (!actor.activo || actor.rol !== "ASISTENTE") {
    throw new Error("Solo el Asistente asignado puede responder.");
  }
  const input = respuestaAsignacionSchema.parse(rawInput);
  const result = await db.$transaction(async (tx) => {
    const assignment = await tx.asignacionAsistente.findUnique({
      where: { id: input.asignacionId },
      include: {
        asistente: { include: { usuario: true } },
        instancia: { include: { solicitud: true } }
      }
    });
    if (!assignment || assignment.asistente.usuarioId !== actor.id) {
      throw new Error("La asignación no pertenece a esta sesión.");
    }
    if (assignment.estado !== "ASIGNADO") {
      throw new Error("La asignación ya fue respondida.");
    }
    if (assignment.instancia.estado !== "PROGRAMADA" || assignment.instancia.finProgramadoAt <= new Date()) {
      throw new Error("La reunión ya no admite una respuesta.");
    }
    const estado = estadoParaRespuestaAsignacion(input.accion);
    const updated = await tx.asignacionAsistente.update({
      where: { id: assignment.id },
      data: { estado },
      select: { id: true, estado: true, instanciaSalaId: true }
    });
    await tx.auditoria.create({
      data: {
        actorUsuarioId: actor.id,
        accion: estado === "ACEPTADO" ? "ASISTENCIA_ACEPTADA" : "ASISTENCIA_RECHAZADA",
        entidadTipo: "AsignacionAsistente",
        entidadId: assignment.id,
        valorAnterior: { estado: assignment.estado },
        valorNuevo: { estado }
      }
    });
    const admins = await tx.usuario.findMany({
      where: { activo: true, rol: "ADMINISTRACION" },
      select: { id: true, emailPrincipal: true }
    });
    const assistantName = [
      assignment.asistente.usuario.nombres,
      assignment.asistente.usuario.apellidos
    ].filter(Boolean).join(" ") || "El asistente";
    return {
      assignment: updated,
      recipients: admins.map(({ id, emailPrincipal }) => ({ usuarioId: id, email: emailPrincipal })),
      notification: {
        tipo: "ASISTENCIA_ASIGNACION" as const,
        titulo: estado === "ACEPTADO" ? "Asistencia confirmada" : "Asistencia rechazada",
        cuerpo: `${assistantName} ${estado === "ACEPTADO" ? "confirmó" : "rechazó"} la asistencia de ${assignment.instancia.solicitud.titulo}.`,
        href: estado === "RECHAZADO" ? "/cobertura-asistencias?estado=pendientes" : `/reuniones/${assignment.instancia.solicitud.id}`,
        metadata: { asignacionId: assignment.id, instanciaSalaId: assignment.instanciaSalaId, estado },
        emailSubject: estado === "ACEPTADO" ? "Asistencia confirmada" : "Una reunión volvió a quedar sin cobertura"
      }
    };
  });
  await safelyNotify(() => notificarUsuarios(db, result.recipients, result.notification));
  return result.assignment;
}

export async function actualizarDisponibilidadSemanal(
  db: PrismaClient,
  actor: SessionActor,
  rawInput: unknown
): Promise<void> {
  if (!actor.activo || actor.rol !== "ASISTENTE") {
    throw new Error("Solo Asistente puede gestionar su disponibilidad.");
  }
  const input = disponibilidadSemanalSchema.parse(rawInput);
  if (new Set(input.franjas.map(({ diaSemana }) => diaSemana)).size !== input.franjas.length) {
    throw new Error("Solo puede definirse una franja habitual por día.");
  }
  await db.$transaction(async (tx) => {
    const assistant = await tx.asistente.findUnique({
      where: { usuarioId: actor.id },
      select: { id: true }
    });
    if (!assistant) throw new Error("No existe un perfil de Asistente para esta sesión.");
    await tx.asistente.update({
      where: { id: assistant.id },
      data: { disponibleGeneral: input.disponibleGeneral }
    });
    await tx.disponibilidadAsistente.deleteMany({
      where: { asistenteId: assistant.id, fecha: null }
    });
    if (input.franjas.length > 0) {
      await tx.disponibilidadAsistente.createMany({
        data: input.franjas.map((franja) => ({
          asistenteId: assistant.id,
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
        entidadTipo: "Asistente",
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
  const meeting = await dependencies.db.instanciaSala.findUnique({
    where: { id: instanciaSalaId },
    select: {
      eventosProveedor: {
        where: { proveedor: { tipo: "GOOGLE_MEET" } },
        select: {
          codigoReunion: true,
          cuentaProveedor: { select: { emailOrganizador: true } }
        },
        take: 1
      },
      cohosts: {
        select: { cuentaGoogle: { select: { email: true } } }
      },
      cohostEmails: { select: { email: true } }
    }
  });
  const event = meeting?.eventosProveedor[0];
  if (!meeting || !event?.codigoReunion) return;
  const cohostEmails = withRequiredCohostEmails([
    ...meeting.cohosts.map(({ cuentaGoogle }) => cuentaGoogle.email),
    ...meeting.cohostEmails.map(({ email }) => email)
  ]);
  if (cohostEmails.length === 0) return;
  const credentials = await cargarCredencialesEncuentro(
    dependencies.db,
    dependencies.descifrar,
    event.cuentaProveedor?.emailOrganizador
  );
  await dependencies.configurarEspacio(credentials, event.codigoReunion, { cohostEmails });
}
