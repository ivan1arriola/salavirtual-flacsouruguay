import type { PrismaClient } from "@prisma/client";
import { ForbiddenApiError } from "@/src/lib/http/api-error";
import type { SessionActor } from "@/src/lib/auth/session-actor.adapter";
import { formatDate, formatTime } from "@/src/lib/ui/format";
import { notificarUsuario, notificarUsuarios } from "../notificaciones/notificaciones.service";
import type { NotificationMessage } from "../notificaciones/domain";
import { construirHtmlResumenMonitoreo } from "./correo-monitoreo.domain";

const ACTIVE_ASSIGNMENTS = ["ASIGNADO", "ACEPTADO"] as const;

export type ResultadoNotificacionSinAsignar = Readonly<{
  reunionesCount: number;
  asistentesCount: number;
  message: string;
}>;

export type ResultadoNotificacionAsignadas = Readonly<{
  asignacionesCount: number;
  asistentesCount: number;
  message: string;
}>;

/**
 * Renotifica a todos los asistentes disponibles la lista de todas las reuniones
 * futuras que requieren asistencia técnica y no tienen una persona asignada.
 */
export async function renotificarReunionesSinAsignar(
  db: PrismaClient,
  actor: SessionActor
): Promise<ResultadoNotificacionSinAsignar> {
  if (!actor.activo || actor.rol !== "ADMINISTRACION") {
    throw new ForbiddenApiError("Solo Administración puede renotificar reuniones sin asignar.");
  }

  const now = new Date();
  const meetings = await db.instanciaSala.findMany({
    where: {
      requiereAsistenciaTecnica: true,
      estado: "PROGRAMADA",
      finProgramadoAt: { gte: now },
      asignaciones: {
        none: {
          estado: { in: [...ACTIVE_ASSIGNMENTS] }
        }
      }
    },
    orderBy: [{ inicioProgramadoAt: "asc" }, { id: "asc" }],
    include: {
      solicitud: {
        include: {
          docentePrograma: {
            include: {
              programa: true,
              docente: { include: { usuario: true } }
            }
          }
        }
      }
    }
  });

  if (meetings.length === 0) {
    return {
      reunionesCount: 0,
      asistentesCount: 0,
      message: "No hay reuniones pendientes de asignación hasta la fecha."
    };
  }

  const assistants = await db.asistenteTecnico.findMany({
    where: {
      disponibleGeneral: true,
      cesadoHastaProximoInicioSesion: false,
      usuario: { activo: true, rol: "ASISTENTE_TECNICO" }
    },
    select: {
      id: true,
      usuario: { select: { id: true, emailPrincipal: true, nombres: true, apellidos: true } }
    }
  });

  const recipients = assistants
    .filter((a) => Boolean(a.usuario.emailPrincipal))
    .map((a) => ({
      usuarioId: a.usuario.id,
      email: a.usuario.emailPrincipal
    }));

  if (recipients.length === 0) {
    return {
      reunionesCount: meetings.length,
      asistentesCount: 0,
      message: "Hay reuniones sin asignar, pero no se encontraron asistentes de monitoreo disponibles para notificar."
    };
  }

  const detalleTexto = [
    `Hay ${meetings.length} ${meetings.length === 1 ? "reunión que requiere" : "reuniones que requieren"} cobertura de monitoreo y aún no tienen asistente asignado:`,
    "",
    ...meetings.map((m, i) => {
      const prog = m.solicitud.docentePrograma.programa.nombre;
      const doc = `${m.solicitud.docentePrograma.docente.usuario.nombres} ${m.solicitud.docentePrograma.docente.usuario.apellidos ?? ""}`.trim();
      const inicio = m.inicioAsistenciaTecnicaAt ?? m.inicioProgramadoAt;
      const fin = m.finAsistenciaTecnicaAt ?? m.finProgramadoAt;
      const mod = (m.modalidadOverride ?? m.solicitud.modalidad) === "HIBRIDA" ? "Híbrida" : "Virtual";
      return [
        `${i + 1}. ${formatDate(inicio)} · Horario técnico: ${formatTime(inicio)}–${formatTime(fin)} h (${mod})`,
        `   Reunión: ${m.solicitud.titulo}`,
        `   Programa: ${prog}`,
        `   Docente: ${doc}`
      ].join("\n");
    }),
    "",
    "Podés postularte ingresando en Agenda Abierta:",
    "https://salavirtual.flacso.edu.uy/agenda-abierta"
  ].join("\n");

  const message: NotificationMessage = {
    tipo: "ASISTENCIA_REQUERIDA",
    titulo: `Reuniones disponibles para monitoreo (${meetings.length})`,
    cuerpo: `Hay ${meetings.length} ${meetings.length === 1 ? "reunión sin asignar" : "reuniones sin asignar"} esperando cobertura. Podés postularte en Agenda Abierta.`,
    emailSubject: `Cobertura de monitoreo: ${meetings.length} ${meetings.length === 1 ? "reunión disponible" : "reuniones disponibles"} para postularse`,
    emailText: detalleTexto,
    emailHtml: construirHtmlResumenMonitoreo({
      variante: "disponibles",
      reuniones: meetings.map((m) => {
        const inicioMonitoreo = m.inicioAsistenciaTecnicaAt ?? m.inicioProgramadoAt;
        const finMonitoreo = m.finAsistenciaTecnicaAt ?? m.finProgramadoAt;
        const docente = m.solicitud.docentePrograma.docente.usuario;
        const modalidad = m.modalidadOverride ?? m.solicitud.modalidad;
        return {
          fecha: formatDate(inicioMonitoreo),
          titulo: m.solicitud.titulo,
          inicioMonitoreo: formatTime(inicioMonitoreo),
          finMonitoreo: formatTime(finMonitoreo),
          inicioClase: formatTime(m.inicioProgramadoAt),
          finClase: formatTime(m.finProgramadoAt),
          modalidad: modalidad === "PRESENCIAL" ? "Presencial" : modalidad === "HIBRIDA" ? "Híbrida" : "Virtual",
          programa: m.solicitud.docentePrograma.programa.nombre,
          docente: (docente.nombres + " " + (docente.apellidos ?? "")).trim()
        };
      })
    }),
    emailActionLabel: "Ver reuniones en Agenda Abierta",
    href: "/agenda-abierta",
    metadata: {
      totalReuniones: meetings.length,
      tipoNotificacion: "MASIVA_SIN_ASIGNAR"
    }
  };

  await notificarUsuarios(db, recipients, message);

  await db.auditoria.create({
    data: {
      actorUsuarioId: actor.id,
      accion: "RENOTIFICAR_REUNIONES_SIN_ASIGNAR_MASIVO",
      entidadTipo: "InstanciaSala",
      entidadId: "MASIVO",
      valorNuevo: {
        totalReuniones: meetings.length,
        destinatarios: recipients.length
      }
    }
  });

  return {
    reunionesCount: meetings.length,
    asistentesCount: recipients.length,
    message: `Se notificaron ${meetings.length} ${meetings.length === 1 ? "reunión sin asignar" : "reuniones sin asignar"} a ${recipients.length} asistentes de monitoreo.`
  };
}

/**
 * Notifica a cada asistente técnico la lista de todas las reuniones
 * futuras que tiene actualmente asignadas.
 */
export async function notificarReunionesAsignadas(
  db: PrismaClient,
  actor: SessionActor
): Promise<ResultadoNotificacionAsignadas> {
  if (!actor.activo || actor.rol !== "ADMINISTRACION") {
    throw new ForbiddenApiError("Solo Administración puede notificar reuniones asignadas.");
  }

  const now = new Date();
  const assignments = await db.asignacionAsistenciaTecnica.findMany({
    where: {
      estado: { in: [...ACTIVE_ASSIGNMENTS] },
      instancia: {
        requiereAsistenciaTecnica: true,
        estado: "PROGRAMADA",
        finProgramadoAt: { gte: now }
      },
      asistenteTecnico: {
        cesadoHastaProximoInicioSesion: false,
        usuario: { activo: true, rol: "ASISTENTE_TECNICO" }
      }
    },
    orderBy: [{ instancia: { inicioProgramadoAt: "asc" } }, { id: "asc" }],
    include: {
      asistenteTecnico: {
        include: {
          usuario: { select: { id: true, emailPrincipal: true, nombres: true, apellidos: true } }
        }
      },
      instancia: {
        include: {
          solicitud: {
            include: {
              docentePrograma: {
                include: {
                  programa: true,
                  docente: { include: { usuario: true } }
                }
              }
            }
          },
          eventosProveedor: {
            where: { proveedor: { tipo: "GOOGLE_MEET" } },
            take: 1
          }
        }
      }
    }
  });

  if (assignments.length === 0) {
    return {
      asignacionesCount: 0,
      asistentesCount: 0,
      message: "No hay reuniones asignadas programadas hasta la fecha."
    };
  }

  // Agrupar asignaciones por usuario asistente
  const porAsistente = new Map<string, {
    asistente: { id: string; email: string | null; nombres: string; apellidos: string | null };
    items: typeof assignments;
  }>();

  for (const asg of assignments) {
    const usr = asg.asistenteTecnico.usuario;
    if (!porAsistente.has(usr.id)) {
      porAsistente.set(usr.id, {
        asistente: { id: usr.id, email: usr.emailPrincipal, nombres: usr.nombres, apellidos: usr.apellidos },
        items: []
      });
    }
    porAsistente.get(usr.id)!.items.push(asg);
  }

  for (const { asistente, items } of porAsistente.values()) {
    if (!asistente.email) continue;

    const detalleTexto = [
      `Hola ${asistente.nombres}, este es tu cronograma de monitoreos asignados hasta la fecha (${items.length} ${items.length === 1 ? "reunión" : "reuniones"}):`,
      "",
      ...items.map((asg, i) => {
        const inst = asg.instancia;
        const prog = inst.solicitud.docentePrograma.programa.nombre;
        const doc = `${inst.solicitud.docentePrograma.docente.usuario.nombres} ${inst.solicitud.docentePrograma.docente.usuario.apellidos ?? ""}`.trim();
        const inicioTecnico = inst.inicioAsistenciaTecnicaAt ?? inst.inicioProgramadoAt;
        const finTecnico = inst.finAsistenciaTecnicaAt ?? inst.finProgramadoAt;
        const mod = (inst.modalidadOverride ?? inst.solicitud.modalidad) === "HIBRIDA" ? "Híbrida" : "Virtual";
        const meet = inst.eventosProveedor[0];
        const lineas = [
          `${i + 1}. ${formatDate(inicioTecnico)} · Horario de monitoreo: ${formatTime(inicioTecnico)}–${formatTime(finTecnico)} h (${mod})`,
          `   Reunión: ${inst.solicitud.titulo}`,
          `   Programa: ${prog}`,
          `   Docente: ${doc}`
        ];
        if (meet?.joinUrl) {
          lineas.push(`   Enlace de Meet: ${meet.joinUrl}`);
        }
        return lineas.join("\n");
      }),
      "",
      "Podés consultar tus reuniones asignadas y gestionar el monitoreo en:",
      "https://salavirtual.flacso.edu.uy/mi-agenda"
    ].join("\n");

    const message: NotificationMessage = {
      tipo: "ASISTENCIA_ASIGNACION",
      titulo: `Tus reuniones de monitoreo asignadas (${items.length})`,
      cuerpo: `Tenés ${items.length} ${items.length === 1 ? "reunión asignada" : "reuniones asignadas"} para monitoreo. Consultá tu cronograma y accesos en Mi Agenda.`,
      emailSubject: `Cronograma de monitoreo: ${items.length} ${items.length === 1 ? "reunión asignada" : "reuniones asignadas"}`,
      emailText: detalleTexto,
      emailHtml: construirHtmlResumenMonitoreo({
        variante: "asignadas",
        nombre: asistente.nombres,
        reuniones: items.map((asg) => {
          const inst = asg.instancia;
          const inicioMonitoreo = inst.inicioAsistenciaTecnicaAt ?? inst.inicioProgramadoAt;
          const finMonitoreo = inst.finAsistenciaTecnicaAt ?? inst.finProgramadoAt;
          const docente = inst.solicitud.docentePrograma.docente.usuario;
          const modalidad = inst.modalidadOverride ?? inst.solicitud.modalidad;
          return {
            fecha: formatDate(inicioMonitoreo),
            titulo: inst.solicitud.titulo,
            inicioMonitoreo: formatTime(inicioMonitoreo),
            finMonitoreo: formatTime(finMonitoreo),
            inicioClase: formatTime(inst.inicioProgramadoAt),
            finClase: formatTime(inst.finProgramadoAt),
            modalidad: modalidad === "PRESENCIAL" ? "Presencial" : modalidad === "HIBRIDA" ? "Híbrida" : "Virtual",
            programa: inst.solicitud.docentePrograma.programa.nombre,
            docente: (docente.nombres + " " + (docente.apellidos ?? "")).trim(),
            meetUrl: inst.eventosProveedor[0]?.joinUrl
          };
        })
      }),
      emailActionLabel: "Ver mis reuniones en Mi Agenda",
      href: "/mi-agenda",
      metadata: {
        totalAsignaciones: items.length,
        tipoNotificacion: "MASIVA_ASIGNADAS"
      }
    };

    await notificarUsuario(db, { usuarioId: asistente.id, email: asistente.email }, message);
  }

  await db.auditoria.create({
    data: {
      actorUsuarioId: actor.id,
      accion: "NOTIFICAR_ASIGNACIONES_MASIVO",
      entidadTipo: "AsignacionAsistenciaTecnica",
      entidadId: "MASIVO",
      valorNuevo: {
        totalAsignaciones: assignments.length,
        asistentesNotificados: porAsistente.size
      }
    }
  });

  return {
    asignacionesCount: assignments.length,
    asistentesCount: porAsistente.size,
    message: `Se notificaron ${assignments.length} ${assignments.length === 1 ? "reunión asignada" : "reuniones asignadas"} a ${porAsistente.size} asistentes de monitoreo.`
  };
}

