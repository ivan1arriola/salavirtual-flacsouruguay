import { randomUUID } from "node:crypto";
import type { PrismaClient } from "@prisma/client";
import { z } from "zod";
import {
  ConflictApiError,
  ForbiddenApiError,
  IntegrationApiError,
  NotFoundApiError,
  ValidationApiError,
} from "@/src/lib/http/api-error";
import {
  crearReunionesSchema,
  diasDeReunion,
  encuentrosComienzanEnFuturo,
  puedeCrearReuniones,
  resolverAsignacionInicial,
} from "./reuniones.domain";
import type { RolUsuario } from "../usuarios/roles";
import { etiquetaProveedor, normalizeCohostEmails } from "@/src/modules/conferencias/api";
import { elegirCuentaHostParaPeriodos } from "./encuentros.domain";
import { bloquearReservaSalas } from "./reserva-salas.adapter";
import { ANTICIPACION_VIRTUAL_MINUTOS } from "./horarios-asistencia.domain";
import { reservarAsistenteDisponible } from "../asistencia/reserva-asistencia.service";

export type ActorReunion = Readonly<{ id: string; rol: RolUsuario }>;

const invitadosEmailsSchema = z.preprocess(
  (value) => {
    if (typeof value === "string") {
      return value.split(/[\n,;]+/).map((item) => item.trim().toLowerCase()).filter(Boolean);
    }
    return value;
  },
  z.array(z.email().transform((email) => email.toLowerCase())).max(100).default([]),
);

export async function crearReuniones(
  db: PrismaClient,
  actor: ActorReunion,
  rawInput: unknown,
  claveIdempotenciaCreacion?: string,
): Promise<Readonly<{
  solicitudId: string;
  reuniones: number;
  dias: readonly string[];
  eventoProveedorIds: readonly string[];
  reutilizada: boolean;
}>> {
  const parsed = crearReunionesSchema.parse(rawInput);
  // Siempre guardar la cobertura virtual fija, incluso para clientes API antiguos
  // que todavía no envían horarios de asistencia.
  const input = parsed.requiereAsistenciaTecnica && parsed.modalidad === "VIRTUAL"
    ? {
        ...parsed,
        instancias: parsed.instancias.map((instancia) => ({
          ...instancia,
          asistenciaInicio: new Date(instancia.inicio.getTime() - ANTICIPACION_VIRTUAL_MINUTOS * 60 * 1000),
          asistenciaFin: instancia.fin
        }))
      }
    : parsed;
  const invitadosSolicitados = invitadosEmailsSchema.parse(
    rawInput && typeof rawInput === "object" && "invitadosEmails" in rawInput
      ? (rawInput as { invitadosEmails?: unknown }).invitadosEmails
      : undefined,
  );

  let asistenteTecnicoId: string | null;
  try {
    asistenteTecnicoId = resolverAsignacionInicial(
      actor.rol,
      input.requiereAsistenciaTecnica,
      input.asistenteTecnicoId,
    );
  } catch (error) {
    throw new ValidationApiError(error instanceof Error ? error.message : "Asignación inicial inválida.");
  }

  return db.$transaction(async (tx) => {
    if (claveIdempotenciaCreacion) {
      await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${`flacso-meet:crear-reunion:${claveIdempotenciaCreacion}`}))`;
      const existente = await tx.solicitudSala.findUnique({
        where: { claveIdempotenciaCreacion },
        select: {
          id: true,
          creadaPorUsuarioId: true,
          timezone: true,
          instancias: {
            orderBy: { ordinal: "asc" },
            select: {
              inicioProgramadoAt: true,
              eventosProveedor: { select: { id: true } },
            },
          },
        },
      });
      if (existente) {
        if (existente.creadaPorUsuarioId !== actor.id) {
          throw new ConflictApiError("La clave de creación ya fue utilizada por otro usuario.");
        }
        return {
          solicitudId: existente.id,
          reuniones: existente.instancias.length,
          dias: diasDeReunion(existente.instancias, existente.timezone),
          eventoProveedorIds: existente.instancias.flatMap(({ eventosProveedor }) =>
            eventosProveedor.map(({ id }) => id)
          ),
          reutilizada: true,
        };
      }
    }

    if (!encuentrosComienzanEnFuturo(input.instancias, new Date())) {
      throw new ValidationApiError("Todos los encuentros deben comenzar en el futuro.");
    }

    const [docentePrograma, proveedorMeet] = await Promise.all([
      tx.docentePrograma.findUnique({
        where: { id: input.docenteProgramaId },
        include: {
          docente: { select: { usuarioId: true } },
          programa: { select: { activo: true } },
        },
      }),
      tx.proveedorReunion.findUnique({ where: { tipo: input.proveedor } }),
    ]);
    if (!docentePrograma) throw new NotFoundApiError("La asociación docente-programa no existe.");
    if (!docentePrograma.activo || !docentePrograma.programa.activo) {
      throw new ConflictApiError("La asociación docente-programa no está activa.");
    }
    if (!puedeCrearReuniones(actor.rol, actor.id, docentePrograma.docente.usuarioId)) {
      throw new ForbiddenApiError("No tiene permisos para crear reuniones de este docente.");
    }
    if (!proveedorMeet || (input.proveedor === "ZOOM" && !proveedorMeet.operativo)) {
      throw new IntegrationApiError(`${etiquetaProveedor(input.proveedor)} no está configurado como proveedor.`, 503);
    }

    await bloquearReservaSalas(tx, proveedorMeet.id);
    const periodosAsistencia = input.instancias.map((instancia) => ({
      inicio: instancia.asistenciaInicio ?? instancia.inicio,
      fin: instancia.asistenciaFin ?? instancia.fin,
    }));
    const reservaAsistente = asistenteTecnicoId
      ? await reservarAsistenteDisponible(tx, asistenteTecnicoId, input.modalidad, periodosAsistencia)
      : null;
    const assistant = reservaAsistente?.assistant ?? null;

    const [hosts, occupiedHosts] = await Promise.all([
      tx.cuentaProveedor.findMany({
        where: { proveedorId: proveedorMeet.id, activa: true, tieneLicencia: true },
        orderBy: [{ prioridad: "asc" }, { id: "asc" }],
        select: { id: true, prioridad: true, limiteConcurrente: true },
      }),
      tx.eventoProveedor.findMany({
        where: {
          proveedorId: proveedorMeet.id,
          cuentaProveedorId: { not: null },
          instancia: {
            estado: "PROGRAMADA",
            OR: input.instancias.map(({ inicio, fin }) => ({
              inicioProgramadoAt: { lt: fin },
              finProgramadoAt: { gt: inicio },
            })),
          },
        },
        select: {
          cuentaProveedorId: true,
          instancia: { select: { inicioProgramadoAt: true, finProgramadoAt: true } },
        },
      }),
    ]);

    // El docente es siempre cohost. Si hay un asistente ya asignado, también se agrega
    // como cohost técnico. Los cohosts adicionales ingresados en el formulario se guardan
    // como correos manuales y Google Meet validará que correspondan a cuentas Google.
    const cohostUserIds = [
      docentePrograma.docente.usuarioId,
      ...(assistant ? [assistant.usuarioId] : []),
    ];
    const [linkedAccounts, docenteUser] = await Promise.all([
      tx.cuentaGoogleFlacso.findMany({
        where: { userId: { in: [...new Set(cohostUserIds)] }, user: { activo: true } },
        select: { id: true, userId: true, email: true },
      }),
      tx.usuario.findUnique({
        where: { id: docentePrograma.docente.usuarioId },
        select: { emailPrincipal: true },
      }),
    ]);

    const usersWithGoogleAccount = new Set(linkedAccounts.map(({ userId }) => userId));
    const fallbackEmails: string[] = [];
    if (!usersWithGoogleAccount.has(docentePrograma.docente.usuarioId)) {
      if (!docenteUser?.emailPrincipal) {
        throw new ValidationApiError("El docente no tiene una cuenta Google configurada para usar como cohost.");
      }
      fallbackEmails.push(docenteUser.emailPrincipal);
    }
    if (
      assistant &&
      !usersWithGoogleAccount.has(assistant.usuarioId) &&
      assistant.usuario.emailPrincipal
    ) {
      fallbackEmails.push(assistant.usuario.emailPrincipal);
    }

    const cohostIds = [...new Set(linkedAccounts.map(({ id }) => id))];
    const manualCohostEmails = normalizeCohostEmails([
      ...input.cohostEmailsManual,
      ...fallbackEmails,
    ]);
    const cohostEmailSet = new Set(normalizeCohostEmails([
      ...linkedAccounts.map(({ email }) => email),
      ...manualCohostEmails,
    ]));
    const invitadosEmails = normalizeCohostEmails(invitadosSolicitados)
      .filter((email) => !cohostEmailSet.has(email));

    if (cohostIds.length === 0 && manualCohostEmails.length === 0) {
      throw new ValidationApiError("El docente debe tener una cuenta Google válida para ser cohost.");
    }

    const cuentaHostId = elegirCuentaHostParaPeriodos(
      null,
      hosts,
      occupiedHosts.flatMap(({ cuentaProveedorId, instancia }) => cuentaProveedorId ? [{
        cuentaProveedorId,
        inicio: instancia.inicioProgramadoAt,
        fin: instancia.finProgramadoAt,
      }] : []),
      input.instancias,
    );
    if (!cuentaHostId) {
      throw new ConflictApiError(`No hay una sala ${etiquetaProveedor(input.proveedor)} libre para todas las fechas solicitadas.`);
    }

    const startTimes = input.instancias.map(({ inicio }) => inicio.getTime());
    const endTimes = input.instancias.map(({ fin }) => fin.getTime());
    const firstAssistance = input.instancias[0];
    const hasSharedAssistanceSchedule = Boolean(
      firstAssistance?.asistenciaInicio && firstAssistance.asistenciaFin &&
      input.instancias.every((instancia) =>
        instancia.asistenciaInicio?.getTime() === firstAssistance.asistenciaInicio?.getTime() &&
        instancia.asistenciaFin?.getTime() === firstAssistance.asistenciaFin?.getTime()
      )
    );
    const solicitud = await tx.solicitudSala.create({
      data: {
        claveIdempotenciaCreacion,
        serieReunionId: randomUUID(),
        docenteProgramaId: input.docenteProgramaId,
        creadaPorUsuarioId: actor.id,
        titulo: input.titulo,
        descripcion: input.descripcion,
        modalidad: input.modalidad,
        tipoInstancias: input.instancias.length === 1 ? "UNICA" : "MULTIPLE",
        timezone: input.timezone,
        fechaInicioSolicitada: new Date(Math.min(...startTimes)),
        fechaFinSolicitada: new Date(Math.max(...endTimes)),
        cantidadInstancias: input.instancias.length,
        requiereAsistenciaTecnica: input.requiereAsistenciaTecnica,
        inicioAsistenciaTecnicaAt: hasSharedAssistanceSchedule ? firstAssistance.asistenciaInicio : null,
        finAsistenciaTecnicaAt: hasSharedAssistanceSchedule ? firstAssistance.asistenciaFin : null,
        requiereGrabacion: input.requiereGrabacion,
        tipoProveedor: input.proveedor,
        estado: "REGISTRADA",
      },
    });

    const eventoProveedorIds = await Promise.all(
      input.instancias.map(async (fecha, index) => {
        const instancia = await tx.instanciaSala.create({
          data: {
            solicitudSalaId: solicitud.id,
            ordinal: index + 1,
            descripcion: fecha.descripcion || input.descripcion,
            inicioProgramadoAt: fecha.inicio,
            finProgramadoAt: fecha.fin,
            inicioAsistenciaTecnicaAt: fecha.asistenciaInicio ?? null,
            finAsistenciaTecnicaAt: fecha.asistenciaFin ?? null,
            timezone: input.timezone,
            requiereAsistenciaTecnica: input.requiereAsistenciaTecnica,
            requiereGrabacion: input.requiereGrabacion,
          },
        });
        const evento = await tx.eventoProveedor.create({
          data: {
            instanciaSalaId: instancia.id,
            proveedorId: proveedorMeet.id,
            cuentaProveedorId: cuentaHostId,
            operacionPendiente: "PROVISIONAR",
            ...(invitadosEmails.length > 0
              ? { payloadUltimo: { salaVirtual: { invitadosEmails } } }
              : {}),
          },
        });
        if (cohostIds.length > 0) {
          await tx.cohostReunion.createMany({
            data: cohostIds.map((id) => ({ instanciaSalaId: instancia.id, cuentaGoogleId: id })),
          });
        }
        if (manualCohostEmails.length > 0) {
          await tx.cohostEmailReunion.createMany({
            data: manualCohostEmails.map((email) => ({ instanciaSalaId: instancia.id, email })),
          });
        }
        if (asistenteTecnicoId) {
          const tarifa = reservaAsistente!.tarifa;
          await tx.asignacionAsistenciaTecnica.create({
            data: {
              instanciaSalaId: instancia.id,
              asistenteTecnicoId,
              tarifaAsistenciaTecnicaId: tarifa.id,
              tarifaHoraAplicada: tarifa.valorHora,
              moneda: tarifa.moneda,
            },
          });
        }
        return evento.id;
      }),
    );

    return {
      solicitudId: solicitud.id,
      reuniones: input.instancias.length,
      eventoProveedorIds,
      dias: diasDeReunion(
        input.instancias.map(({ inicio }) => ({ inicioProgramadoAt: inicio })),
        input.timezone,
      ),
      reutilizada: false,
    };
  });
}
