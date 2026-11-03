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
import { normalizeCohostEmails } from "@/src/modules/conferencias/api";
import { elegirCuentaHostParaPeriodos } from "./encuentros.domain";
import { bloquearReservaSalas } from "./reserva-salas.adapter";
import { ANTICIPACION_VIRTUAL_MINUTOS } from "./horarios-asistencia.domain";
import { reunionCompartidaHabilitada } from "./reunion-compartida.domain";
import { claveSerieReunion } from "./serie-reunion.domain";
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
  opciones: Readonly<{ reunionCompartida?: boolean }> = {},
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

    const tipoProveedor = "ZOOM" as const;
    const [docentePrograma, proveedor] = await Promise.all([
      tx.docentePrograma.findUnique({
        where: { id: input.docenteProgramaId },
        include: {
          docente: { select: { usuarioId: true } },
          programa: { select: { activo: true } },
        },
      }),
      tx.proveedorReunion.findUnique({ where: { tipo: tipoProveedor } }),
    ]);
    if (!docentePrograma) throw new NotFoundApiError("La asociación docente-programa no existe.");
    if (!docentePrograma.activo || !docentePrograma.programa.activo) {
      throw new ConflictApiError("La asociación docente-programa no está activa.");
    }
    if (!puedeCrearReuniones(actor.rol, actor.id, docentePrograma.docente.usuarioId)) {
      throw new ForbiddenApiError("No tiene permisos para crear reuniones de este docente.");
    }
    if (!proveedor) {
      const nombreProv = tipoProveedor === "ZOOM" ? "Zoom" : "Google Meet";
      throw new IntegrationApiError(`${nombreProv} no está configurado como proveedor.`, 503);
    }

    await bloquearReservaSalas(tx, proveedor.id);
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
        where: { proveedorId: proveedor.id, activa: true, tieneLicencia: true },
        orderBy: [{ prioridad: "asc" }, { id: "asc" }],
        select: { id: true, prioridad: true, limiteConcurrente: true },
      }),
      tx.eventoProveedor.findMany({
        where: {
          proveedorId: proveedor.id,
          cuentaProveedorId: { not: null },
          instancia: {
            estado: { in: ["PROGRAMADA", "EN_CURSO"] },
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

    // El docente y el asistente asignado se guardan como cohosts por correo.
    const docenteUser = await tx.usuario.findUnique({
      where: { id: docentePrograma.docente.usuarioId },
      select: { emailPrincipal: true },
    });

    // Zoom no requiere cuenta Google: se guardan siempre los correos como texto.
    const fallbackEmails: string[] = [];
    if (!docenteUser?.emailPrincipal) {
      throw new ValidationApiError("El docente no tiene un correo principal configurado.");
    }
    fallbackEmails.push(docenteUser.emailPrincipal);
    if (assistant?.usuario.emailPrincipal) {
      fallbackEmails.push(assistant.usuario.emailPrincipal);
    }

    const manualCohostEmails = normalizeCohostEmails([
      ...input.cohostEmailsManual,
      ...fallbackEmails,
    ]);
    const cohostEmailSet = new Set(manualCohostEmails);
    const invitadosEmails = normalizeCohostEmails(invitadosSolicitados)
      .filter((email) => !cohostEmailSet.has(email));

    const cuentaHostId = elegirCuentaHostParaPeriodos(
      null,
      hosts.map((host) => tipoProveedor === "ZOOM" ? { ...host, limiteConcurrente: 1 } : host),
      occupiedHosts.flatMap(({ cuentaProveedorId, instancia }) => cuentaProveedorId ? [{
        cuentaProveedorId,
        inicio: instancia.inicioProgramadoAt,
        fin: instancia.finProgramadoAt,
      }] : []),
      input.instancias,
    );
    if (!cuentaHostId) {
      throw new ConflictApiError(tipoProveedor === "ZOOM" ? "No hay una sala Zoom libre para todas las fechas solicitadas." : "No hay una sala Meet libre para todas las fechas solicitadas.");
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
    const serieReunionId = randomUUID();
    const solicitud = await tx.solicitudSala.create({
      data: {
        claveIdempotenciaCreacion,
        serieReunionId,
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
        estado: "REGISTRADA",
      },
    });

    // Con la bandera encendida, todos los encuentros de la serie comparten UNA reunión de Zoom
    // (mismo enlace y misma sala). Apagada, cada encuentro conserva su evento independiente.
    const reunionCompartida = (opciones.reunionCompartida ?? reunionCompartidaHabilitada(process.env))
      ? await tx.reunionProveedor.create({
          data: {
            proveedorId: proveedor.id,
            cuentaProveedorId: cuentaHostId,
            serieClave: claveSerieReunion({
              serieReunionId,
              docenteProgramaId: input.docenteProgramaId,
              titulo: input.titulo,
              createdAt: solicitud.createdAt,
            }),
          },
          select: { id: true },
        })
      : null;

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
            proveedorActivoTipo: "ZOOM",
          },
        });
        const evento = await tx.eventoProveedor.create({
          data: {
            instanciaSalaId: instancia.id,
            proveedorId: proveedor.id,
            cuentaProveedorId: cuentaHostId,
            ...(reunionCompartida ? { reunionProveedorId: reunionCompartida.id } : {}),
            operacionPendiente: "PROVISIONAR",
            ...(invitadosEmails.length > 0
              ? { payloadUltimo: { salaVirtual: { invitadosEmails } } }
              : {}),
          },
        });
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
