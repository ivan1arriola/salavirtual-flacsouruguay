import type { Prisma } from "@prisma/client";
import { type PrismaClient } from "@prisma/client";
import type { SessionActor } from "@/src/lib/auth/session-actor.adapter";
import {
  ConflictApiError,
  ForbiddenApiError,
  NotFoundApiError,
  ValidationApiError,
} from "@/src/lib/http/api-error";
import { notificarUsuario } from "@/src/modules/notificaciones/notificaciones.service";
import { assistantWindow, reservarAsistenteDisponible } from "./reserva-asistencia.service";
import { renotificarAsistentesDisponibles } from "./asistencia.service";
import {
  gestionarCoberturaSchema,
  validarIntervaloRetroactivo,
} from "./domain/gestion-cobertura.domain";

type Tx = Prisma.TransactionClient;
const ACTIVE = ["ASIGNADO", "ACEPTADO"] as const;
const HISTORICAL_LIMIT = ["CANCELADA", "NO_REALIZADA"] as const;

async function lockMeeting(tx: Tx, id: string) {
  // Serializa decisiones para la misma instancia (incluidas aprobaciones de dos administradores).
  await tx.$queryRaw`SELECT "id" FROM "InstanciaSala" WHERE "id" = ${id} FOR UPDATE`;
}

async function meetingById(tx: Tx, id: string) {
  const meeting = await tx.instanciaSala.findUnique({
    where: { id },
    include: {
      solicitud: { select: { titulo: true, modalidad: true } },
      asignaciones: {
        where: { estado: { in: [...ACTIVE] } },
        include: {
          asistenteTecnico: {
            include: { usuario: { select: { id: true, emailPrincipal: true } } },
          },
        },
      },
    },
  });
  if (!meeting) {
    throw new NotFoundApiError("El encuentro no existe.");
  }
  return meeting;
}

function requireFuture(meeting: Readonly<{ estado: string; finProgramadoAt: Date }>, now: Date) {
  if (meeting.estado !== "PROGRAMADA" || meeting.finProgramadoAt <= now) {
    throw new ConflictApiError(
      "El encuentro ya finalizó o no está programado. Usá el registro retroactivo.",
    );
  }
}

function requirePast(meeting: Readonly<{ estado: string; finProgramadoAt: Date }>, now: Date) {
  if (HISTORICAL_LIMIT.some((state) => state === meeting.estado) || meeting.finProgramadoAt > now) {
    throw new ConflictApiError(
      "El registro retroactivo solo admite encuentros realizados y finalizados.",
    );
  }
}

async function audit(
  tx: Tx,
  actorId: string,
  accion: string,
  entityId: string,
  valorNuevo: Record<string, string | number | boolean | null>,
) {
  await tx.auditoria.create({
    data: {
      actorUsuarioId: actorId,
      accion,
      entidadTipo: "InstanciaSala",
      entidadId: entityId,
      valorNuevo,
    },
  });
}

export async function gestionarCoberturaMonitoreo(
  db: PrismaClient,
  actor: SessionActor,
  rawInput: unknown,
) {
  if (!actor.activo || actor.rol !== "ADMINISTRACION") {
    throw new ForbiddenApiError("Solo Administración puede gestionar o aprobar estos monitoreos.");
  }
  const input = gestionarCoberturaSchema.parse(rawInput);
  const now = new Date();

  if (input.accion === "CONVOCAR") {
    const result = await db.$transaction(async (tx) => {
      await lockMeeting(tx, input.instanciaSalaId);
      const meeting = await meetingById(tx, input.instanciaSalaId);
      requireFuture(meeting, now);
      if (meeting.asignaciones.length) {
        throw new ConflictApiError("Ya existe una persona asignada.");
      }
      const window = assistantWindow(meeting);
      await tx.instanciaSala.update({
        where: { id: meeting.id },
        data: {
          requiereAsistenciaTecnica: true,
          inicioAsistenciaTecnicaAt: window.inicio,
          finAsistenciaTecnicaAt: window.fin,
        },
      });
      await audit(tx, actor.id, "MONITOREO_CONVOCATORIA_ABIERTA", meeting.id, {
        requiereAsistenciaTecnica: true,
      });
      return { instanciaSalaId: meeting.id, accion: input.accion };
    });
    // Solamente este flujo envía notificaciones al conjunto de asistentes disponibles.
    try {
      await renotificarAsistentesDisponibles(db, actor, {
        instanciaSalaId: result.instanciaSalaId,
      });
      return { ...result, message: "Convocatoria abierta y asistentes disponibles notificados." };
    } catch (error) {
      console.error("No se completó la convocatoria general de monitoreo.", error);
      return {
        ...result,
        warning:
          "El requisito de monitoreo quedó activado, pero las notificaciones generales están pendientes.",
      };
    }
  }

  if (input.accion === "ASIGNAR_DIRECTO") {
    const result = await db.$transaction(async (tx) => {
      await lockMeeting(tx, input.instanciaSalaId);
      const meeting = await meetingById(tx, input.instanciaSalaId);
      requireFuture(meeting, now);
      const window = assistantWindow(meeting);
      const previous = meeting.asignaciones[0] ?? null;
      if (previous?.asistenteTecnicoId === input.asistenteTecnicoId) {
        throw new ConflictApiError("Esta persona ya tiene la cobertura asignada.");
      }
      const { assistant, tarifa } = await reservarAsistenteDisponible(
        tx,
        input.asistenteTecnicoId,
        window.modalidad,
        [{ inicio: window.inicio, fin: window.fin }],
        meeting.id,
      );
      const accounts = await tx.cuentaGoogleFlacso.findMany({
        where: { userId: assistant.usuarioId },
        select: { id: true },
      });
      if (previous) {
        await tx.asignacionAsistenciaTecnica.update({
          where: { id: previous.id },
          data: { estado: "CANCELADO" },
        });
        const oldAccounts = await tx.cuentaGoogleFlacso.findMany({
          where: { userId: previous.asistenteTecnico.usuarioId },
          select: { id: true },
        });
        if (oldAccounts.length) {
          await tx.cohostReunion.deleteMany({
            where: {
              instanciaSalaId: meeting.id,
              cuentaGoogleId: { in: oldAccounts.map(({ id }) => id) },
            },
          });
        }
        if (previous.asistenteTecnico.usuario.emailPrincipal) {
          await tx.cohostEmailReunion.deleteMany({
            where: {
              instanciaSalaId: meeting.id,
              email: previous.asistenteTecnico.usuario.emailPrincipal.toLowerCase(),
            },
          });
        }
      }
      await tx.instanciaSala.update({
        where: { id: meeting.id },
        data: {
          requiereAsistenciaTecnica: true,
          inicioAsistenciaTecnicaAt: window.inicio,
          finAsistenciaTecnicaAt: window.fin,
        },
      });
      const assignment = await tx.asignacionAsistenciaTecnica.upsert({
        where: {
          instanciaSalaId_asistenteTecnicoId: {
            instanciaSalaId: meeting.id,
            asistenteTecnicoId: assistant.id,
          },
        },
        create: {
          instanciaSalaId: meeting.id,
          asistenteTecnicoId: assistant.id,
          estado: "ASIGNADO",
          tarifaAsistenciaTecnicaId: tarifa.id,
          tarifaHoraAplicada: tarifa.valorHora,
          moneda: tarifa.moneda,
        },
        update: {
          estado: "ASIGNADO",
          tarifaAsistenciaTecnicaId: tarifa.id,
          tarifaHoraAplicada: tarifa.valorHora,
          moneda: tarifa.moneda,
          minutosConfirmados: null,
          montoConfirmado: null,
        },
        select: { id: true },
      });
      if (accounts.length) {
        await tx.cohostReunion.createMany({
          data: accounts.map(({ id }) => ({ instanciaSalaId: meeting.id, cuentaGoogleId: id })),
          skipDuplicates: true,
        });
      } else if (assistant.usuario.emailPrincipal) {
        await tx.cohostEmailReunion.createMany({
          data: [
            { instanciaSalaId: meeting.id, email: assistant.usuario.emailPrincipal.toLowerCase() },
          ],
          skipDuplicates: true,
        });
      }
      await audit(tx, actor.id, "MONITOREO_ASIGNADO_DIRECTAMENTE", meeting.id, {
        asistenteTecnicoId: assistant.id,
        asignacionId: assignment.id,
        asistenteAnteriorId: previous?.asistenteTecnicoId ?? null,
      });
      return {
        accion: input.accion,
        instanciaSalaId: meeting.id,
        title: meeting.solicitud.titulo,
        person: { usuarioId: assistant.usuarioId, email: assistant.usuario.emailPrincipal },
        previous: previous
          ? {
              usuarioId: previous.asistenteTecnico.usuarioId,
              email: previous.asistenteTecnico.usuario.emailPrincipal,
            }
          : null,
      };
    });
    const warning: string[] = [];
    if (result.previous) {
      try {
        await notificarUsuario(db, result.previous, {
          tipo: "ASISTENCIA_ASIGNACION",
          titulo: "Monitoreo reasignado",
          cuerpo: `Ya no estás asignado al monitoreo de ${result.title}.`,
          href: "/mi-agenda",
        });
      } catch (error) {
        console.error("No se notificó a la persona anteriormente asignada.", error);
        warning.push("La notificación de reasignación está pendiente.");
      }
    }
    try {
      await notificarUsuario(db, result.person, {
        tipo: "ASISTENCIA_ASIGNACION",
        titulo: "Te asignaron un monitoreo",
        cuerpo: `Quedaste asignado al monitoreo de ${result.title}.`,
        href: "/mi-agenda",
        metadata: { instanciaSalaId: result.instanciaSalaId },
        emailSubject: `Monitoreo asignado: ${result.title}`,
        emailText: `Se te asignó el monitoreo de ${result.title}. Consultá el horario y los enlaces en Sala Virtual. Los permisos de Meet se están sincronizando.`,
      });
    } catch (error) {
      console.error("No se notificó a la persona asignada.", error);
      warning.push("No se pudo completar la notificación individual.");
    }
    return {
      accion: result.accion,
      instanciaSalaId: result.instanciaSalaId,
      warning: warning.join(" ") || null,
    };
  }

  if (input.accion === "REGISTRAR_RETROACTIVO") {
    return db.$transaction(async (tx) => {
      await lockMeeting(tx, input.instanciaSalaId);
      const meeting = await meetingById(tx, input.instanciaSalaId);
      requirePast(meeting, now);
      if (meeting.asignaciones.length) {
        throw new ConflictApiError("El encuentro ya tiene una cobertura activa.");
      }
      const existing = await tx.registroMonitoreoRetroactivo.findFirst({
        where: { instanciaSalaId: meeting.id, estado: { in: ["PENDIENTE", "APROBADO"] } },
      });
      if (existing) {
        throw new ConflictApiError(
          "Ya existe un registro pendiente o aprobado para este encuentro.",
        );
      }
      const person = await tx.asistenteTecnico.findUnique({
        where: { id: input.asistenteTecnicoId },
        select: { id: true },
      });
      if (!person) {
        throw new NotFoundApiError("El asistente seleccionado no existe.");
      }
      let minutos: number;
      try {
        minutos = validarIntervaloRetroactivo(
          input.inicioRealAt,
          input.finRealAt,
          {
            inicio: meeting.inicioProgramadoAt,
            fin: meeting.finProgramadoAt,
          },
          now,
        );
      } catch (error) {
        throw new ValidationApiError(error instanceof Error ? error.message : "Horario no válido.");
      }
      const modalidad = meeting.modalidadOverride ?? meeting.solicitud.modalidad;
      const tarifa = await tx.tarifaAsistenciaTecnica.findFirst({
        where: { modalidad, createdAt: { lte: meeting.inicioProgramadoAt } },
        orderBy: [{ createdAt: "desc" }, { id: "desc" }],
      });
      if (!tarifa) {
        throw new ConflictApiError(
          "No hay una tarifa histórica vigente para esa fecha. Configurala antes de continuar.",
        );
      }
      const monto = tarifa.valorHora.mul(minutos).div(60).toDecimalPlaces(2);
      const registro = await tx.registroMonitoreoRetroactivo.create({
        data: {
          instanciaSalaId: meeting.id,
          asistenteTecnicoId: person.id,
          inicioRealAt: input.inicioRealAt,
          finRealAt: input.finRealAt,
          minutos,
          tarifaAsistenciaTecnicaId: tarifa.id,
          tarifaHora: tarifa.valorHora,
          moneda: tarifa.moneda,
          montoEstimado: monto,
          motivo: input.motivo,
          creadoPorUsuarioId: actor.id,
        },
        select: { id: true },
      });
      await audit(tx, actor.id, "MONITOREO_RETROACTIVO_REGISTRADO", meeting.id, {
        registroId: registro.id,
        asistenteTecnicoId: person.id,
        minutos,
      });
      return {
        accion: input.accion,
        instanciaSalaId: meeting.id,
        registroId: registro.id,
        estado: "PENDIENTE",
      };
    });
  }

  return db.$transaction(async (tx) => {
    const reference = await tx.registroMonitoreoRetroactivo.findUnique({
      where: { id: input.registroId },
    });
    if (!reference) {
      throw new NotFoundApiError("El registro retroactivo no existe.");
    }
    await lockMeeting(tx, reference.instanciaSalaId);
    // Releer bajo el bloqueo: nunca se puede rechazar un registro recién aprobado.
    const record = await tx.registroMonitoreoRetroactivo.findUnique({
      where: { id: reference.id },
    });
    if (!record || record.estado !== "PENDIENTE") {
      throw new ConflictApiError("El registro ya fue revisado.");
    }
    const meeting = await meetingById(tx, record.instanciaSalaId);
    requirePast(meeting, now);
    if (input.accion === "RECHAZAR_RETROACTIVO") {
      await tx.registroMonitoreoRetroactivo.update({
        where: { id: record.id },
        data: {
          estado: "RECHAZADO",
          motivoRechazo: input.motivo,
          revisadoPorUsuarioId: actor.id,
          revisadoAt: now,
        },
      });
      await audit(tx, actor.id, "MONITOREO_RETROACTIVO_RECHAZADO", meeting.id, {
        registroId: record.id,
      });
      return { accion: input.accion, instanciaSalaId: meeting.id, estado: "RECHAZADO" };
    }
    if (meeting.asignaciones.length) {
      throw new ConflictApiError("El encuentro ya tiene una cobertura asignada.");
    }
    const liquidacion = await tx.liquidacionAsistenciaTecnica.findFirst({
      where: {
        asistenteTecnicoId: record.asistenteTecnicoId,
        periodoDesde: { lte: meeting.inicioProgramadoAt },
        periodoHasta: { gt: meeting.inicioProgramadoAt },
        estado: { not: "ANULADA" },
      },
      select: { id: true },
    });
    if (liquidacion) {
      throw new ConflictApiError(
        "Ya existe una liquidación para este período. Revisala antes de aprobar el registro.",
      );
    }
    await tx.asignacionAsistenciaTecnica.upsert({
      where: {
        instanciaSalaId_asistenteTecnicoId: {
          instanciaSalaId: meeting.id,
          asistenteTecnicoId: record.asistenteTecnicoId,
        },
      },
      create: {
        instanciaSalaId: meeting.id,
        asistenteTecnicoId: record.asistenteTecnicoId,
        tarifaAsistenciaTecnicaId: record.tarifaAsistenciaTecnicaId,
        tarifaHoraAplicada: record.tarifaHora,
        moneda: record.moneda,
        minutosConfirmados: record.minutos,
        montoConfirmado: record.montoEstimado,
        estado: "ACEPTADO",
      },
      update: {
        tarifaAsistenciaTecnicaId: record.tarifaAsistenciaTecnicaId,
        tarifaHoraAplicada: record.tarifaHora,
        moneda: record.moneda,
        minutosConfirmados: record.minutos,
        montoConfirmado: record.montoEstimado,
        estado: "ACEPTADO",
      },
    });
    await tx.instanciaSala.update({
      where: { id: meeting.id },
      data: { requiereAsistenciaTecnica: true },
    });
    await tx.registroMonitoreoRetroactivo.update({
      where: { id: record.id },
      data: { estado: "APROBADO", revisadoPorUsuarioId: actor.id, revisadoAt: now },
    });
    await audit(tx, actor.id, "MONITOREO_RETROACTIVO_APROBADO", meeting.id, {
      registroId: record.id,
      asistenteTecnicoId: record.asistenteTecnicoId,
      minutos: record.minutos,
      montoEstimado: record.montoEstimado.toNumber(),
    });
    // Deliberadamente no se actualizan horarios académicos ni se sincroniza Meet/Calendar pasado.
    return { accion: input.accion, instanciaSalaId: meeting.id, estado: "APROBADO" };
  });
}
