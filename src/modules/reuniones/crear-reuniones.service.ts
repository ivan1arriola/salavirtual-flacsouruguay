import type { PrismaClient } from "@prisma/client";
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
  puedeCrearReuniones,
  resolverAsignacionInicial,
} from "./reuniones.domain";
import type { RolUsuario } from "../usuarios/roles";
import { normalizeCohostEmails } from "../meet/cohosts.domain";
import { elegirCuentaHostParaPeriodos } from "./encuentros.domain";
import { bloquearReservaSalas } from "./reserva-salas.adapter";
import { reservarAsistenteDisponible } from "../asistencia/reserva-asistencia.service";

export type ActorReunion = Readonly<{ id: string; rol: RolUsuario }>;

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
  const input = crearReunionesSchema.parse(rawInput);
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

    const ahora = new Date();
    if (input.instancias.some(({ inicio }) => inicio <= ahora)) {
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
      tx.proveedorReunion.findUnique({ where: { tipo: "GOOGLE_MEET" } }),
    ]);
    if (!docentePrograma) throw new NotFoundApiError("La asociación docente-programa no existe.");
    if (!docentePrograma.activo || !docentePrograma.programa.activo) {
      throw new ConflictApiError("La asociación docente-programa no está activa.");
    }
    if (!puedeCrearReuniones(actor.rol, actor.id, docentePrograma.docente.usuarioId)) {
      throw new ForbiddenApiError("No tiene permisos para crear reuniones de este docente.");
    }
    if (!proveedorMeet) throw new IntegrationApiError("Google Meet no está configurado como proveedor.", 503);

    await bloquearReservaSalas(tx, proveedorMeet.id);
    const reservaAsistente = asistenteTecnicoId
      ? await reservarAsistenteDisponible(tx, asistenteTecnicoId, input.modalidad, input.instancias)
      : null;
    const assistant = reservaAsistente?.assistant ?? null;

    const automaticCohostUserIds = [
      docentePrograma.docente.usuarioId,
      ...(assistant ? [assistant.usuarioId] : []),
    ];
    const [cohosts, automaticCohosts, hosts, occupiedHosts] = await Promise.all([
      tx.cuentaGoogleFlacso.findMany({
        where: { id: { in: input.cohostCuentaIds } },
        select: { id: true },
      }),
      tx.cuentaGoogleFlacso.findMany({
        where: { userId: { in: automaticCohostUserIds }, user: { activo: true } },
        select: { id: true },
      }),
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
    if (cohosts.length !== new Set(input.cohostCuentaIds).size) {
      throw new ValidationApiError("Una o más cuentas cohost no existen.");
    }

    const cohostIds = [...new Set([...cohosts, ...automaticCohosts].map(({ id }) => id))];
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
      throw new ConflictApiError("No hay una sala Meet libre para todas las fechas solicitadas.");
    }

    const manualCohostEmails = normalizeCohostEmails(input.cohostEmailsManual);
    const startTimes = input.instancias.map(({ inicio }) => inicio.getTime());
    const endTimes = input.instancias.map(({ fin }) => fin.getTime());
    const solicitud = await tx.solicitudSala.create({
      data: {
        claveIdempotenciaCreacion,
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
        requiereGrabacion: input.requiereGrabacion,
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
