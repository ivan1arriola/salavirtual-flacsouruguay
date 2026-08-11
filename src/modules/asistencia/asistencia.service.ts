import type { PrismaClient } from "@prisma/client";
import { withRequiredCohostEmails } from "../meet/cohosts.domain";
import type { GoogleCalendarCredentials } from "../meet/google-calendar.adapter";
import {
  asignacionAsistenciaSchema,
  cumpleSeparacionMinimaAsistencias,
  disponibilidadSemanalSchema,
  estadoInteresParaAccion,
  notificacionAsistenciaSchema,
  puedeAsignarAsistencia,
  puedeGestionarPostulacion,
  postulacionAsistenciaSchema,
  SEPARACION_MINIMA_ASISTENCIAS_MINUTOS
} from "./asistencia.domain";
import type { SessionActor } from "@/src/lib/auth/session-actor.adapter";
import { cargarCredencialesEncuentro } from "../reuniones/encuentros-persistence.adapter";
import { notificarUsuario, notificarUsuarios } from "../notificaciones/notificaciones.service";
import { bloquearAgendaAsistente } from "./reserva-asistentes.adapter";
import { obtenerTarifaVigente } from "./tarifas.adapter";

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
    throw new Error("Solo un asistente técnico puede gestionar postulaciones.");
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
      throw new Error("No existe un perfil de asistente técnico activo para esta sesión.");
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
      throw new Error("La reunión no está abierta para postulaciones.");
    }
    if (meeting.asignaciones.length > 0) {
      throw new Error("La reunión ya tiene una persona asignada.");
    }

    const estado = estadoInteresParaAccion(input.accion);
    const assistantName = [
      assistant.usuario.nombres,
      assistant.usuario.apellidos
    ].filter(Boolean).join(" ") || "Un asistente técnico";
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
    const notificationType = estado === "ME_INTERESA"
      ? "ASISTENCIA_POSTULACION" as const
      : "ASISTENCIA_POSTULACION_RETIRADA" as const;
    return {
      interest,
      notification: {
        recipients: admins.map((admin) => ({ usuarioId: admin.id, email: admin.emailPrincipal })),
        message: {
          tipo: notificationType,
          titulo: estado === "ME_INTERESA" ? "Nueva postulación de asistencia técnica" : "Postulación retirada",
          cuerpo: `${assistantName} ${estado === "ME_INTERESA" ? "se postulo a" : "retiro su postulacion de"} ${meeting.solicitud.titulo}.`,
          href: "/cobertura-asistencias?estado=pendientes",
          metadata: { instanciaSalaId: meeting.id, asistenteTecnicoId: assistant.id, estado },
          emailSubject: estado === "ME_INTERESA"
            ? "Nueva postulación de asistencia técnica"
            : "Postulación de asistencia técnica retirada"
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
    throw new Error("Solo Administración puede asignar asistentes técnicos.");
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
          requiereAsistenciaTecnica: true,
          finProgramadoAt: true,
          estado: true,
          inicioProgramadoAt: true,
          solicitud: {
            select: {
              id: true,
              titulo: true,
              modalidad: true,
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
            select: {
              id: true,
              asistenteTecnicoId: true,
              estado: true,
              asistenteTecnico: {
                select: {
                  usuario: {
                    select: {
                      id: true,
                      nombres: true,
                      apellidos: true,
                      emailPrincipal: true,
                      cuentasGoogle: { select: { id: true } }
                    }
                  }
                }
              }
            },
            take: 1
          }
        }
      }),
      tx.asistenteTecnico.findUnique({
        where: { id: input.asistenteTecnicoId },
        select: {
          id: true,
          cesadoHastaProximoInicioSesion: true,
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
      !meeting?.requiereAsistenciaTecnica ||
      meeting.estado !== "PROGRAMADA" ||
      meeting.finProgramadoAt <= new Date()
    ) {
      throw new Error("La reunión no admite asignaciones.");
    }
    if (
      !assistant?.usuario.activo ||
      assistant.usuario.rol !== "ASISTENTE_TECNICO" ||
      assistant.cesadoHastaProximoInicioSesion
    ) {
      throw new Error("El perfil seleccionado no corresponde a un asistente técnico disponible.");
    }
    await bloquearAgendaAsistente(tx, assistant.id);
    const separacionMs = SEPARACION_MINIMA_ASISTENCIAS_MINUTOS * 60_000;
    const asignacionesCercanas = await tx.asignacionAsistenciaTecnica.findMany({
      where: {
        asistenteTecnicoId: assistant.id,
        instanciaSalaId: { not: meeting.id },
        estado: { in: [...ACTIVE_ASSIGNMENTS] },
        instancia: {
          estado: "PROGRAMADA",
          finProgramadoAt: {
            gte: new Date(meeting.inicioProgramadoAt.getTime() - separacionMs)
          },
          inicioProgramadoAt: {
            lte: new Date(meeting.finProgramadoAt.getTime() + separacionMs)
          }
        }
      },
      select: {
        instancia: {
          select: {
            inicioProgramadoAt: true,
            finProgramadoAt: true
          }
        }
      }
    });
    const tieneConflicto = asignacionesCercanas.some(({ instancia }) =>
      !cumpleSeparacionMinimaAsistencias(
        { inicio: meeting.inicioProgramadoAt, fin: meeting.finProgramadoAt },
        { inicio: instancia.inicioProgramadoAt, fin: instancia.finProgramadoAt }
      )
    );
    if (tieneConflicto) {
      throw new Error(
        `El asistente necesita al menos ${SEPARACION_MINIMA_ASISTENCIAS_MINUTOS} minutos entre reuniones.`
      );
    }
    const tarifa = await obtenerTarifaVigente(
      tx,
      meeting.solicitud.modalidad
    );
    const previousAssignment = meeting.asignaciones[0] ?? null;
    if (previousAssignment?.asistenteTecnicoId === assistant.id) {
      throw new Error("La persona seleccionada ya está asignada a la reunión.");
    }
    if (previousAssignment) {
      await tx.asignacionAsistenciaTecnica.update({
        where: { id: previousAssignment.id },
        data: { estado: "CANCELADO" }
      });
      const previousGoogleIds = previousAssignment.asistenteTecnico.usuario.cuentasGoogle.map(({ id }) => id);
      if (previousGoogleIds.length > 0) {
        await tx.cohostReunion.deleteMany({
          where: {
            instanciaSalaId: meeting.id,
            cuentaGoogleId: { in: previousGoogleIds }
          }
        });
      }
    }
    const assignment = await tx.asignacionAsistenciaTecnica.upsert({
      where: {
        instanciaSalaId_asistenteTecnicoId: {
          instanciaSalaId: meeting.id,
          asistenteTecnicoId: assistant.id
        }
      },
      create: {
        instanciaSalaId: meeting.id,
        asistenteTecnicoId: assistant.id,
        estado: "ASIGNADO",
        tarifaAsistenciaTecnicaId: tarifa.id,
        tarifaHoraAplicada: tarifa.valorHora,
        moneda: tarifa.moneda
      },
      update: {
        estado: "ASIGNADO",
        tarifaAsistenciaTecnicaId: tarifa.id,
        tarifaHoraAplicada: tarifa.valorHora,
        moneda: tarifa.moneda
      },
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
        accion: previousAssignment ? "ASISTENTE_REASIGNADO" : "ASISTENTE_ASIGNADO",
        entidadTipo: "InstanciaSala",
        entidadId: meeting.id,
        valorAnterior: previousAssignment
          ? { asistenteTecnicoId: previousAssignment.asistenteTecnicoId, estado: previousAssignment.estado }
          : undefined,
        valorNuevo: { asistenteTecnicoId: assistant.id, estado: assignment.estado }
      }
    });
    const assignmentMessage = {
      tipo: "ASISTENCIA_ASIGNACION" as const,
      titulo: "Asistencia técnica asignada",
      cuerpo: `${meeting.solicitud.titulo} quedó asignada a ${[
        assistant.usuario.nombres,
        assistant.usuario.apellidos
      ].filter(Boolean).join(" ") || "la persona asignada"}.`,
      href: "/mi-agenda",
      metadata: {
        instanciaSalaId: meeting.id,
        asistenteTecnicoId: assistant.id,
        inicioProgramadoAt: meeting.inicioProgramadoAt.toISOString()
      }
    };
    return {
      assignment,
      previousAssistantNotification: previousAssignment ? {
        recipient: {
          usuarioId: previousAssignment.asistenteTecnico.usuario.id,
          email: previousAssignment.asistenteTecnico.usuario.emailPrincipal
        },
        message: {
          tipo: "ASISTENCIA_ASIGNACION" as const,
          titulo: "Asistencia técnica reasignada",
          cuerpo: `La cobertura de ${meeting.solicitud.titulo} fue reasignada a otra persona.`,
          href: "/mi-agenda",
          metadata: { instanciaSalaId: meeting.id, estado: "CANCELADO" },
          emailSubject: "Cambio en una asistencia técnica asignada"
        }
      } : null,
      assistantNotification: {
        recipient: {
          usuarioId: assistant.usuario.id,
          email: assistant.usuario.emailPrincipal
        },
        message: {
          ...assignmentMessage,
          titulo: "Te asignaron una reunion",
          cuerpo: `${meeting.solicitud.titulo} quedó asignada a tu agenda de asistencia técnica.`,
          href: "/mi-agenda",
          emailSubject: "Te asignaron una asistencia técnica"
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
          emailSubject: "Asistencia técnica asignada para una reunión"
        }
      }
    };
  });
  await Promise.all([
    result.previousAssistantNotification
      ? safelyNotify(() => notificarUsuario(
          db,
          result.previousAssistantNotification!.recipient,
          result.previousAssistantNotification!.message
        ))
      : Promise.resolve(),
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

export async function renotificarAsistentesDisponibles(
  db: PrismaClient,
  actor: SessionActor,
  rawInput: unknown
): Promise<number> {
  if (!puedeAsignarAsistencia(actor.rol) || !actor.activo) {
    throw new Error("Solo Administración puede volver a notificar asistentes técnicos.");
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
      throw new Error("La sesión de Administración ya no es válida.");
    }
    if (!meeting?.requiereAsistenciaTecnica || meeting.estado !== "PROGRAMADA" || meeting.finProgramadoAt <= new Date()) {
      throw new Error("La reunión ya no necesita cobertura de asistencia técnica.");
    }
    if (meeting.asignaciones.length > 0) {
      throw new Error("La reunión ya tiene una persona asignada.");
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
        titulo: "Cobertura de asistencia técnica disponible",
        cuerpo: `${meeting.solicitud.titulo} (${meeting.solicitud.docentePrograma.programa.nombre}) necesita asistencia técnica.`,
        href: "/agenda-abierta",
        metadata: {
          instanciaSalaId: meeting.id,
          inicioProgramadoAt: meeting.inicioProgramadoAt.toISOString()
        },
        emailSubject: "Recordatorio de cobertura de asistencia técnica disponible"
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
    throw new Error("Solo un asistente técnico puede gestionar su disponibilidad.");
  }
  const input = disponibilidadSemanalSchema.parse(rawInput);
  if (new Set(input.franjas.map(({ diaSemana }) => diaSemana)).size !== input.franjas.length) {
    throw new Error("Solo puede definirse una franja habitual por día.");
  }
  await db.$transaction(async (tx) => {
    const assistant = await tx.asistenteTecnico.findUnique({
      where: { usuarioId: actor.id },
      select: { id: true }
    });
    if (!assistant) throw new Error("No existe un perfil de asistente técnico para esta sesión.");
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
