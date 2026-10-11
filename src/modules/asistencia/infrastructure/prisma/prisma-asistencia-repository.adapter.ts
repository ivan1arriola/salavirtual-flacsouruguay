import type { Prisma, PrismaClient } from "@prisma/client";
import { ConflictApiError, ForbiddenApiError, ValidationApiError } from "@/src/lib/http/api-error";
import {
  cumpleSeparacionMinimaAsistencias,
  resolverAccionHistorialAsistente,
  SEPARACION_MINIMA_ASISTENCIAS_MINUTOS,
  type ModalidadAsistencia,
  type RegistroAsistenciaPersonal,
  type RegistroHistorialAsistenciaPersonal
} from "../../domain";
import type {
  ActualizarPostulacionInput,
  AsignacionRow,
  AsistenciaRepositoryPort,
  AssistantProfile,
  DisponibilidadSemanalInput,
  MeetingCoverInfo,
  ReportarDuracionInput
} from "../../ports";

const ACTIVE_ASSIGNMENTS = ["ASIGNADO", "ACEPTADO"] as const;

export function crearPrismaAsistenciaRepositoryAdapter(
  db: PrismaClient
): AsistenciaRepositoryPort {
  return {
    async obtenerPerfilAsistentePorUsuarioId(usuarioId: string): Promise<AssistantProfile | null> {
      const assistant = await db.asistenteTecnico.findUnique({
        where: { usuarioId },
        select: {
          id: true,
          usuarioId: true,
          cesadoHastaProximoInicioSesion: true,
          usuario: { select: { activo: true, rol: true, nombres: true, apellidos: true, emailPrincipal: true } }
        }
      });

      if (!assistant || assistant.usuario.rol !== "ASISTENTE_TECNICO") return null;

      const nombre = `${assistant.usuario.nombres} ${assistant.usuario.apellidos ?? ""}`.trim();
      return {
        id: assistant.id,
        usuarioId: assistant.usuarioId,
        nombre: nombre || "Asistente Técnico",
        email: assistant.usuario.emailPrincipal,
        activo: assistant.usuario.activo,
        cesadoHastaProximoInicioSesion: Boolean(assistant.cesadoHastaProximoInicioSesion)
      };
    },

    async actualizarPostulacion(input: ActualizarPostulacionInput): Promise<void> {
      await db.$transaction(async (tx) => {
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

        await tx.postulacionAsistenciaTecnica.upsert({
          where: {
            instanciaSalaId_asistenteTecnicoId: {
              instanciaSalaId: meeting.id,
              asistenteTecnicoId: input.asistenteTecnicoId
            }
          },
          create: {
            instanciaSalaId: meeting.id,
            asistenteTecnicoId: input.asistenteTecnicoId,
            estado: input.estado,
            comentario: input.comentario
          },
          update: {
            estado: input.estado,
            comentario: input.comentario
          }
        });

        const assistant = await tx.asistenteTecnico.findUnique({
          where: { id: input.asistenteTecnicoId },
          select: { usuarioId: true }
        });

        if (assistant) {
          await tx.auditoria.create({
            data: {
              actorUsuarioId: assistant.usuarioId,
              accion: input.estado === "ME_INTERESA" ? "POSTULACION_REGISTRADA" : "POSTULACION_RETIRADA",
              entidadTipo: "InstanciaSala",
              entidadId: meeting.id,
              valorNuevo: {
                asistenteTecnicoId: input.asistenteTecnicoId,
                estado: input.estado,
                comentario: input.comentario ?? null
              }
            }
          });
        }
      });
    },

    async reservarYAsignarAsistente(
      instanciaSalaId: string,
      asistenteTecnicoId: string,
      adminUsuarioId: string
    ): Promise<AsignacionRow> {
      return db.$transaction(async (tx) => {
        await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${`flacso-meet:asistente:${asistenteTecnicoId}`}))`;

        const admin = await tx.usuario.findUnique({
          where: { id: adminUsuarioId },
          select: { id: true, activo: true, rol: true }
        });
        if (!admin?.activo || admin.rol !== "ADMINISTRACION") {
          throw new ForbiddenApiError("La sesión de Administración ya no es válida.");
        }

        const meeting = await tx.instanciaSala.findUnique({
          where: { id: instanciaSalaId },
          select: {
            id: true,
            requiereAsistenciaTecnica: true,
            inicioProgramadoAt: true,
            finProgramadoAt: true,
            modalidadOverride: true,
            inicioAsistenciaTecnicaAt: true,
            finAsistenciaTecnicaAt: true,
            estado: true,
            solicitud: {
              select: {
                id: true,
                titulo: true,
                modalidad: true
              }
            },
            asignaciones: {
              where: { estado: { in: [...ACTIVE_ASSIGNMENTS] } },
              select: { id: true, asistenteTecnicoId: true }
            }
          }
        });

        if (!meeting?.requiereAsistenciaTecnica || meeting.estado !== "PROGRAMADA") {
          throw new ConflictApiError("La reunión no requiere cobertura o ya no está programada.");
        }
        if (meeting.finProgramadoAt <= new Date()) {
          throw new ConflictApiError("No se puede asignar asistencia técnica a una reunión que ya finalizó.");
        }

        const currentActive = meeting.asignaciones[0];
        if (currentActive && currentActive.asistenteTecnicoId === asistenteTecnicoId) {
          throw new ConflictApiError("El asistente ya está asignado a esta reunión.");
        }

        const assistant = await tx.asistenteTecnico.findUnique({
          where: { id: asistenteTecnicoId },
          select: {
            id: true,
            usuarioId: true,
            cesadoHastaProximoInicioSesion: true,
            usuario: {
              select: {
                activo: true,
                rol: true,
                emailPrincipal: true,
                cuentasGoogle: { select: { id: true } }
              }
            }
          }
        });

        if (
          !assistant?.usuario.activo ||
          assistant.usuario.rol !== "ASISTENTE_TECNICO" ||
          assistant.cesadoHastaProximoInicioSesion
        ) {
          throw new ConflictApiError("El asistente técnico seleccionado no está disponible.");
        }

        const modalidadEfectiva = meeting.modalidadOverride ?? meeting.solicitud.modalidad;
        if (
          modalidadEfectiva === "HIBRIDA" &&
          (!meeting.inicioAsistenciaTecnicaAt || !meeting.finAsistenciaTecnicaAt)
        ) {
          throw new ConflictApiError(
            "Definí la hora exacta de llegada y salida del asistente antes de asignar una reunión híbrida."
          );
        }
        const inicioAsistencia = meeting.inicioAsistenciaTecnicaAt ?? meeting.inicioProgramadoAt;
        const finAsistencia = meeting.finAsistenciaTecnicaAt ?? meeting.finProgramadoAt;

        const existing = await tx.asignacionAsistenciaTecnica.findMany({
          where: {
            asistenteTecnicoId,
            estado: { in: [...ACTIVE_ASSIGNMENTS] },
            instanciaSalaId: { not: meeting.id },
            instancia: { estado: "PROGRAMADA" }
          },
          select: {
            instancia: {
              select: {
                inicioProgramadoAt: true,
                finProgramadoAt: true,
                inicioAsistenciaTecnicaAt: true,
                finAsistenciaTecnicaAt: true
              }
            }
          }
        });

        const periodos = [
          ...existing.map(({ instancia }) => ({
            inicio: instancia.inicioAsistenciaTecnicaAt ?? instancia.inicioProgramadoAt,
            fin: instancia.finAsistenciaTecnicaAt ?? instancia.finProgramadoAt
          })),
          { inicio: inicioAsistencia, fin: finAsistencia }
        ];

        const conflict = periodos.some((periodo, index) =>
          periodos.slice(0, index).some((other) => !cumpleSeparacionMinimaAsistencias(periodo, other))
        );

        if (conflict) {
          throw new ConflictApiError(
            `El asistente necesita al menos ${SEPARACION_MINIMA_ASISTENCIAS_MINUTOS} minutos entre reuniones.`
          );
        }

        const tarifa = await tx.tarifaAsistenciaTecnica.findFirst({
          where: { modalidad: modalidadEfectiva },
          orderBy: [{ createdAt: "desc" }, { id: "desc" }],
          select: { id: true, valorHora: true, moneda: true }
        });

        if (!tarifa) {
          throw new ConflictApiError("No hay una tarifa configurada para la modalidad de la reunión.");
        }

        if (currentActive) {
          await tx.asignacionAsistenciaTecnica.update({
            where: { id: currentActive.id },
            data: { estado: "CANCELADO" }
          });
        }

        const created = await tx.asignacionAsistenciaTecnica.create({
          data: {
            instanciaSalaId: meeting.id,
            asistenteTecnicoId: assistant.id,
            estado: "ASIGNADO",
            tarifaAsistenciaTecnicaId: tarifa.id,
            tarifaHoraAplicada: tarifa.valorHora,
            moneda: tarifa.moneda
          },
          select: { id: true, instanciaSalaId: true, asistenteTecnicoId: true, estado: true }
        });

        await tx.auditoria.create({
          data: {
            actorUsuarioId: adminUsuarioId,
            accion: currentActive ? "ASISTENTE_REASIGNADO" : "ASISTENTE_ASIGNADO",
            entidadTipo: "InstanciaSala",
            entidadId: meeting.id,
            valorAnterior: currentActive ? { asistenteTecnicoId: currentActive.asistenteTecnicoId } : undefined,
            valorNuevo: {
              asistenteTecnicoId: assistant.id,
              asignacionId: created.id,
              tarifaHora: tarifa.valorHora.toNumber()
            }
          }
        });

        return {
          id: created.id,
          instanciaSalaId: created.instanciaSalaId,
          asistenteTecnicoId: created.asistenteTecnicoId,
          estado: created.estado,
          asistenteUsuarioId: assistant.usuarioId,
          asistenteEmail: assistant.usuario.emailPrincipal,
          googleAccountIds: assistant.usuario.cuentasGoogle.map(({ id }) => id)
        };
      });
    },

    async desvincularAsistente(
      asignacionId: string,
      actorUsuarioId: string
    ): Promise<AsignacionRow> {
      return db.$transaction(async (tx) => {
        const actor = await tx.usuario.findUnique({
          where: { id: actorUsuarioId },
          select: { id: true, activo: true, rol: true }
        });
        if (
          !actor?.activo ||
          !["ADMINISTRACION", "ASISTENTE_TECNICO"].includes(actor.rol)
        ) {
          throw new ForbiddenApiError("La sesión ya no tiene permisos para modificar esta asignación.");
        }

        const assignment = await tx.asignacionAsistenciaTecnica.findUnique({
          where: { id: asignacionId },
          select: {
            id: true,
            instanciaSalaId: true,
            asistenteTecnicoId: true,
            estado: true,
            detallesLiquidacion: { select: { id: true }, take: 1 },
            instancia: {
              select: {
                inicioProgramadoAt: true,
                inicioAsistenciaTecnicaAt: true
              }
            },
            asistenteTecnico: {
              select: {
                usuarioId: true,
                usuario: {
                  select: {
                    emailPrincipal: true,
                    cuentasGoogle: { select: { id: true } }
                  }
                }
              }
            }
          }
        });

        if (!assignment || !ACTIVE_ASSIGNMENTS.includes(assignment.estado as any)) {
          throw new ConflictApiError("La asignación ya no está activa.");
        }

        const esBajaPropia = actor.rol === "ASISTENTE_TECNICO";
        if (esBajaPropia && assignment.asistenteTecnico.usuarioId !== actor.id) {
          throw new ForbiddenApiError("Solo podés darte de baja de tus propias asignaciones.");
        }
        const inicioAsistencia =
          assignment.instancia.inicioAsistenciaTecnicaAt ??
          assignment.instancia.inicioProgramadoAt;
        if (esBajaPropia && inicioAsistencia <= new Date()) {
          throw new ConflictApiError("No podés darte de baja una vez iniciado el monitoreo.");
        }
        if (assignment.detallesLiquidacion.length > 0) {
          throw new ConflictApiError("No se puede desvincular una asignación incluida en una liquidación.");
        }

        const updated = await tx.asignacionAsistenciaTecnica.update({
          where: { id: assignment.id },
          data: { estado: "CANCELADO" },
          select: { id: true, instanciaSalaId: true, estado: true, asistenteTecnicoId: true }
        });

        if (esBajaPropia) {
          await tx.postulacionAsistenciaTecnica.updateMany({
            where: {
              instanciaSalaId: assignment.instanciaSalaId,
              asistenteTecnicoId: assignment.asistenteTecnicoId,
              estado: "ME_INTERESA"
            },
            data: { estado: "RETIRADO" }
          });
        }

        const googleIds = assignment.asistenteTecnico.usuario.cuentasGoogle.map(({ id }) => id);
        if (googleIds.length > 0) {
          await tx.cohostReunion.deleteMany({
            where: {
              instanciaSalaId: assignment.instanciaSalaId,
              cuentaGoogleId: { in: googleIds }
            }
          });
        }
        if (assignment.asistenteTecnico.usuario.emailPrincipal) {
          await tx.cohostEmailReunion.deleteMany({
            where: {
              instanciaSalaId: assignment.instanciaSalaId,
              email: assignment.asistenteTecnico.usuario.emailPrincipal.toLowerCase()
            }
          });
        }

        await tx.auditoria.create({
          data: {
            actorUsuarioId: actor.id,
            accion: "ASISTENTE_DESVINCULADO",
            entidadTipo: "InstanciaSala",
            entidadId: assignment.instanciaSalaId,
            valorAnterior: {
              asistenteTecnicoId: assignment.asistenteTecnicoId,
              estado: assignment.estado
            },
            valorNuevo: {
              asistenteTecnicoId: assignment.asistenteTecnicoId,
              estado: "CANCELADO",
              origen: esBajaPropia ? "BAJA_VOLUNTARIA" : "ADMINISTRACION"
            }
          }
        });

        return {
          id: updated.id,
          instanciaSalaId: updated.instanciaSalaId,
          asistenteTecnicoId: updated.asistenteTecnicoId,
          estado: updated.estado,
          asistenteUsuarioId: assignment.asistenteTecnico.usuarioId,
          asistenteEmail: assignment.asistenteTecnico.usuario.emailPrincipal,
          googleAccountIds: googleIds
        };
      });
    },

    async reportarDuracion(input: ReportarDuracionInput, ahora = new Date()): Promise<void> {
      await db.$transaction(async (tx) => {
        const asignacion = await tx.asignacionAsistenciaTecnica.findUnique({
          where: { id: input.asignacionId },
          select: {
            id: true,
            estado: true,
            tarifaHoraAplicada: true,
            moneda: true,
            instanciaSalaId: true,
            asistenteTecnico: { select: { usuarioId: true } },
            instancia: {
              select: {
                estado: true,
                finProgramadoAt: true
              }
            }
          }
        });

        if (
          !asignacion ||
          asignacion.asistenteTecnico.usuarioId !== input.usuarioId ||
          !ACTIVE_ASSIGNMENTS.includes(asignacion.estado as any)
        ) {
          throw new ForbiddenApiError("La reunión no está asignada a este usuario.");
        }
        if (
          asignacion.instancia.estado !== "FINALIZADA" &&
          asignacion.instancia.finProgramadoAt > ahora
        ) {
          throw new ConflictApiError("La duración solo se puede informar al finalizar la reunión.");
        }
        if (["CANCELADA", "NO_REALIZADA"].includes(asignacion.instancia.estado)) {
          throw new ConflictApiError("No se puede informar duración para esta reunión.");
        }

        const minutos = Math.round((input.finReal.getTime() - input.inicioReal.getTime()) / 60_000);
        const monto = asignacion.tarifaHoraAplicada.mul(minutos).div(60);

        await tx.instanciaSala.update({
          where: { id: asignacion.instanciaSalaId },
          data: {
            inicioRealAt: input.inicioReal,
            finRealAt: input.finReal,
            minutosReportados: minutos,
            comentariosReporte: input.comentario
          }
        });

        await tx.asignacionAsistenciaTecnica.update({
          where: { id: asignacion.id },
          data: {
            minutosConfirmados: minutos,
            montoConfirmado: monto
          }
        });

        if (input.incidencia) {
          await tx.incidencia.create({
            data: {
              instanciaSalaId: asignacion.instanciaSalaId,
              tipo: input.incidencia.tipo,
              severidad: input.incidencia.severidad as any,
              descripcion: input.incidencia.descripcion
            }
          });
        }

        await tx.auditoria.create({
          data: {
            actorUsuarioId: input.usuarioId,
            accion: "REPORTE_DURACION_ENVIADO",
            entidadTipo: "InstanciaSala",
            entidadId: asignacion.instanciaSalaId,
            valorNuevo: {
              minutos,
              monto: monto.toNumber(),
              tieneIncidencia: Boolean(input.incidencia)
            }
          }
        });
      });
    },

    async actualizarDisponibilidad(
      usuarioId: string,
      input: DisponibilidadSemanalInput
    ): Promise<void> {
      if (new Set(input.franjas.map(({ diaSemana }) => diaSemana)).size !== input.franjas.length) {
        throw new ValidationApiError("Solo puede definirse una franja habitual por día.");
      }

      await db.$transaction(async (tx) => {
        const assistant = await tx.asistenteTecnico.findUnique({
          where: { usuarioId },
          select: { id: true }
        });
        if (!assistant) throw new ForbiddenApiError("No existe un perfil de asistente técnico para esta sesión.");

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
            actorUsuarioId: usuarioId,
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
    },

    async obtenerAsistenciasPersonales(
      usuarioId: string,
      periodo: "MES_ACTUAL" | "HISTORICO",
      ahora = new Date()
    ): Promise<readonly RegistroAsistenciaPersonal[]> {
      const assistant = await db.asistenteTecnico.findUnique({
        where: { usuarioId },
        select: { id: true }
      });
      if (!assistant) return [];

      const parts = new Intl.DateTimeFormat("en-CA", {
        timeZone: "America/Montevideo",
        year: "numeric",
        month: "2-digit"
      }).formatToParts(ahora);
      const year = Number(parts.find((p) => p.type === "year")?.value);
      const month = Number(parts.find((p) => p.type === "month")?.value);
      const desdeMes = new Date(Date.UTC(year, month - 1, 1, 3));
      const hastaMes = new Date(Date.UTC(year, month, 1, 3));

      const rango =
        periodo === "MES_ACTUAL"
          ? { gte: desdeMes, lt: hastaMes }
          : { lt: desdeMes };

      const asignaciones = await db.asignacionAsistenciaTecnica.findMany({
        where: {
          asistenteTecnicoId: assistant.id,
          estado: { in: ["ASIGNADO", "ACEPTADO"] },
          instancia: {
            requiereAsistenciaTecnica: true,
            estado: { notIn: ["CANCELADA", "NO_REALIZADA"] },
            inicioProgramadoAt: rango,
            solicitud: { estado: { not: "CANCELADA" } }
          }
        },
        orderBy: { instancia: { inicioProgramadoAt: periodo === "MES_ACTUAL" ? "asc" : "desc" } },
        take: periodo === "MES_ACTUAL" ? 100 : 500,
        include: {
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
              }
            }
          }
        }
      });

      return asignaciones.map((asignacion) => {
        const instancia = asignacion.instancia;
        const asociacion = instancia.solicitud.docentePrograma;
        const inicioAsistencia = instancia.inicioAsistenciaTecnicaAt ?? instancia.inicioProgramadoAt;
        const finAsistencia = instancia.finAsistenciaTecnicaAt ?? instancia.finProgramadoAt;
        const minProg = Math.max(
          0,
          Math.round((finAsistencia.getTime() - inicioAsistencia.getTime()) / 60_000)
        );
        const minutos =
          asignacion.minutosConfirmados ??
          instancia.minutosReportados ??
          Math.max(
            0,
            Math.round(
              ((instancia.finRealAt ?? finAsistencia).getTime() -
                (instancia.inicioRealAt ?? inicioAsistencia).getTime()) /
                60_000
            )
          );
        const tarifaHora = asignacion.tarifaHoraAplicada?.toNumber() ?? null;
        const monto =
          asignacion.montoConfirmado?.toNumber() ??
          (tarifaHora !== null ? (tarifaHora * minutos) / 60 : null);

        return {
          id: asignacion.id,
          instanciaId: instancia.id,
          titulo: instancia.solicitud.titulo,
          programa: asociacion.programa.nombre,
          docente: `${asociacion.docente.usuario.nombres} ${asociacion.docente.usuario.apellidos ?? ""}`.trim(),
          inicioAt: inicioAsistencia,
          finAt: finAsistencia,
          inicioRealAt: instancia.inicioRealAt,
          finRealAt: instancia.finRealAt,
          modalidad: (instancia.modalidadOverride ?? instancia.solicitud.modalidad) as ModalidadAsistencia,
          estado: instancia.estado,
          completada: instancia.estado === "FINALIZADA" || finAsistencia.getTime() <= ahora.getTime(),
          cierreConfirmado: asignacion.minutosConfirmados !== null,
          minutos,
          minutosProgramados: minProg,
          minutosReportados: instancia.minutosReportados,
          comentarioReporte: instancia.comentariosReporte,
          tarifaHora,
          monto,
          moneda: asignacion.moneda ?? "UYU"
        };
      });
    },

    async obtenerHistorialAsistenteEnRango(
      usuarioId: string,
      desde: Date,
      hasta: Date,
      limite = 500
    ): Promise<readonly RegistroHistorialAsistenciaPersonal[]> {
      const assistant = await db.asistenteTecnico.findUnique({
        where: { usuarioId },
        select: { id: true }
      });
      if (!assistant) return [];

      const assignments = await db.asignacionAsistenciaTecnica.findMany({
        where: {
          asistenteTecnicoId: assistant.id,
          instancia: {
            inicioProgramadoAt: { gte: desde, lt: hasta }
          }
        },
        select: {
          instanciaSalaId: true,
          instancia: {
            select: {
              inicioProgramadoAt: true,
              solicitud: { select: { titulo: true } }
            }
          }
        }
      });
      if (assignments.length === 0) return [];

      const meetingById = new Map(
        assignments.map((assignment) => [
          assignment.instanciaSalaId,
          {
            titulo: assignment.instancia.solicitud.titulo,
            instanciaInicioAt: assignment.instancia.inicioProgramadoAt
          }
        ])
      );

      const audits = await db.auditoria.findMany({
        where: {
          entidadTipo: "InstanciaSala",
          entidadId: { in: [...meetingById.keys()] },
          accion: {
            in: ["ASISTENTE_ASIGNADO", "ASISTENTE_REASIGNADO", "ASISTENTE_DESVINCULADO"]
          },
          createdAt: { gte: desde, lt: hasta }
        },
        orderBy: { createdAt: "desc" },
        take: limite,
        include: {
          actor: {
            select: { nombres: true, apellidos: true }
          }
        }
      });

      const helperAsistenteId = (value: unknown): string | null => {
        if (!value || Array.isArray(value) || typeof value !== "object") return null;
        const id = (value as Record<string, unknown>).asistenteTecnicoId;
        return typeof id === "string" ? id : null;
      };

      return audits.flatMap((audit) => {
        const meeting = meetingById.get(audit.entidadId);
        if (!meeting) return [];

        const accion = resolverAccionHistorialAsistente(
          audit.accion,
          helperAsistenteId(audit.valorAnterior),
          helperAsistenteId(audit.valorNuevo),
          assistant.id
        );
        if (!accion) return [];

        const actor = audit.actor
          ? `${audit.actor.nombres} ${audit.actor.apellidos ?? ""}`.trim()
          : "Sistema";

        return [
          {
            id: audit.id,
            accion,
            titulo: meeting.titulo,
            instanciaInicioAt: meeting.instanciaInicioAt,
            ocurrioAt: audit.createdAt,
            actor: actor || "Sistema"
          }
        ];
      });
    },

    async obtenerSlugAsistente(usuarioId: string): Promise<string | null> {
      const assistant = await db.asistenteTecnico.findUnique({
        where: { usuarioId },
        select: { slug: true }
      });
      return assistant?.slug ?? null;
    },

    async obtenerAsistentesParaNotificacion(instanciaSalaId: string): Promise<Readonly<{
      reunion: MeetingCoverInfo;
      destinatarios: readonly string[];
    }>> {
      const meeting = await db.instanciaSala.findUnique({
        where: { id: instanciaSalaId },
        select: {
          id: true,
          requiereAsistenciaTecnica: true,
          finProgramadoAt: true,
          inicioProgramadoAt: true,
          modalidadOverride: true,
          inicioAsistenciaTecnicaAt: true,
          finAsistenciaTecnicaAt: true,
          estado: true,
          solicitud: {
            select: {
              titulo: true,
              modalidad: true,
              docentePrograma: { select: { docente: { select: { usuario: { select: { nombres: true, apellidos: true } } } } } }
            }
          },
          asignaciones: {
            where: { estado: { in: [...ACTIVE_ASSIGNMENTS] } },
            select: { id: true }
          }
        }
      });

      if (!meeting || !meeting.requiereAsistenciaTecnica || meeting.estado !== "PROGRAMADA") {
        throw new ConflictApiError("La reunión ya no necesita cobertura de asistencia técnica.");
      }
      if (meeting.asignaciones.length > 0) {
        throw new ConflictApiError("La reunión ya tiene una persona asignada.");
      }

      const assistants = await db.asistenteTecnico.findMany({
        where: {
          usuario: { activo: true, rol: "ASISTENTE_TECNICO" },
          cesadoHastaProximoInicioSesion: false
        },
        select: { usuarioId: true }
      });

      const docente = meeting.solicitud.docentePrograma.docente.usuario;
      const docenteNombre = `${docente.nombres} ${docente.apellidos ?? ""}`.trim();

      return {
        reunion: {
          id: meeting.id,
          titulo: meeting.solicitud.titulo,
          inicio: meeting.inicioAsistenciaTecnicaAt ?? meeting.inicioProgramadoAt,
          fin: meeting.finAsistenciaTecnicaAt ?? meeting.finProgramadoAt,
          modalidad: (meeting.modalidadOverride ?? meeting.solicitud.modalidad) as ModalidadAsistencia,
          docenteNombre
        },
        destinatarios: assistants.map(({ usuarioId }) => usuarioId)
      };
    }
  };
}
