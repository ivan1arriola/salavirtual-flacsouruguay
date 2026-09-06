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
  encuentrosComienzanEnFuturo,
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

    let cohostIds: readonly string[] = [];
    let manualCohostEmails: readonly string[] = [];

    if (input.requiereAsistenciaTecnica) {
      if (assistant) {
        // Al solicitar asistencia técnica y haber asistente designado, este es el anfitrión
        const assistantAccounts = await tx.cuentaGoogleFlacso.findMany({
          where: { userId: assistant.usuarioId, user: { activo: true } },
          select: { id: true },
        });
        if (assistantAccounts.length > 0) {
          cohostIds = assistantAccounts.map(({ id }) => id);
        } else if (assistant.usuario.emailPrincipal) {
          manualCohostEmails = [assistant.usuario.emailPrincipal.toLowerCase()];
        }
      } else {
        // Mientras no esté designado el asistente técnico, no se asigna cohost
        cohostIds = [];
        manualCohostEmails = [];
      }
    } else {
      // Sin asistencia técnica: el solicitante designa al anfitrión y se incluye a sí mismo automáticamente
      const designatedHostUserIds: string[] = [];
      const extraCohostCuentaIds = new Set(input.cohostCuentaIds);
      const extraEmails = [...input.cohostEmailsManual];

      if (input.hostTipo === "DOCENTE") {
        designatedHostUserIds.push(docentePrograma.docente.usuarioId);
      } else if (input.hostTipo === "OTRA_CUENTA" && input.hostCuentaId) {
        extraCohostCuentaIds.add(input.hostCuentaId);
      } else if (input.hostTipo === "OTRO_CORREO" && input.hostEmail) {
        extraEmails.push(input.hostEmail);
      }

      // El solicitante también se pone como anfitrión automáticamente
      designatedHostUserIds.push(actor.id);

      const [actorAndDesignatedAccounts, explicitAccounts, actorUser, docenteUser] = await Promise.all([
        tx.cuentaGoogleFlacso.findMany({
          where: { userId: { in: [...new Set(designatedHostUserIds)] }, user: { activo: true } },
          select: { id: true, userId: true },
        }),
        extraCohostCuentaIds.size > 0
          ? tx.cuentaGoogleFlacso.findMany({
              where: { id: { in: [...extraCohostCuentaIds] }, user: { activo: true } },
              select: { id: true },
            })
          : Promise.resolve([]),
        tx.usuario.findUnique({
          where: { id: actor.id },
          select: { emailPrincipal: true },
        }),
        input.hostTipo === "DOCENTE"
          ? tx.usuario.findUnique({
              where: { id: docentePrograma.docente.usuarioId },
              select: { emailPrincipal: true },
            })
          : Promise.resolve(null),
      ]);

      if (explicitAccounts.length !== extraCohostCuentaIds.size) {
        throw new ValidationApiError("Una o más cuentas cohost no existen o están inactivas.");
      }

      const actorHasGoogleAccount = actorAndDesignatedAccounts.some(({ userId }) => userId === actor.id);
      if (!actorHasGoogleAccount && actorUser?.emailPrincipal) {
        extraEmails.push(actorUser.emailPrincipal);
      }

      if (input.hostTipo === "DOCENTE") {
        const docenteHasGoogleAccount = actorAndDesignatedAccounts.some(({ userId }) => userId === docentePrograma.docente.usuarioId);
        if (!docenteHasGoogleAccount && docenteUser?.emailPrincipal) {
          extraEmails.push(docenteUser.emailPrincipal);
        }
      }

      cohostIds = [...new Set([
        ...actorAndDesignatedAccounts.map(({ id }) => id),
        ...explicitAccounts.map(({ id }) => id),
      ])];
      manualCohostEmails = normalizeCohostEmails(extraEmails);

      if (cohostIds.length === 0 && manualCohostEmails.length === 0) {
        throw new ValidationApiError("Debe especificarse al menos una cuenta con permisos de anfitrión.");
      }
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
      throw new ConflictApiError("No hay una sala Meet libre para todas las fechas solicitadas.");
    }

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
