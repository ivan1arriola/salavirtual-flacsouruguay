import type { PrismaClient } from "@prisma/client";
import {
  crearReunionesSchema,
  diasDeReunion,
  puedeCrearReuniones,
  resolverAsignacionInicial,
} from "./reuniones.domain";
import type { RolUsuario } from "../usuarios/roles";
import { withRequiredCohostEmails } from "../meet/cohosts.domain";

export type ActorReunion = Readonly<{
  id: string;
  rol: RolUsuario;
}>;

export async function crearReuniones(
  db: PrismaClient,
  actor: ActorReunion,
  rawInput: unknown,
): Promise<
  Readonly<{
    solicitudId: string;
    reuniones: number;
    dias: readonly string[];
    eventoProveedorIds: readonly string[];
  }>
> {
  const input = crearReunionesSchema.parse(rawInput);
  const asistenteId = resolverAsignacionInicial(
    actor.rol,
    input.requiereAsistencia,
    input.asistenteId
  );

  return db.$transaction(async (tx) => {
    const [docentePrograma, proveedorMeet] = await Promise.all([
      tx.docentePrograma.findUnique({
        where: { id: input.docenteProgramaId },
        include: {
          docente: { select: { usuarioId: true } },
          programa: { select: { activo: true } },
        },
      }),
      tx.proveedorReunion.findUnique({
        where: { tipo: "GOOGLE_MEET" },
      }),
    ]);
    if (!docentePrograma?.activo || !docentePrograma.programa.activo) {
      throw new Error("La asociacion docente-programa no esta activa.");
    }
    if (
      !puedeCrearReuniones(
        actor.rol,
        actor.id,
        docentePrograma.docente.usuarioId,
      )
    ) {
      throw new Error(
        "No tiene permisos para crear reuniones de este docente.",
      );
    }
    if (!proveedorMeet) {
      throw new Error("Google Meet no está configurado como proveedor.");
    }

    const assistant = asistenteId
      ? await tx.asistente.findUnique({
          where: { id: asistenteId },
          select: {
            id: true,
            usuarioId: true,
            usuario: { select: { activo: true, rol: true } }
          }
        })
      : null;
    if (asistenteId && (!assistant?.usuario.activo || assistant.usuario.rol !== "ASISTENTE")) {
      throw new Error("El Asistente seleccionado no está activo.");
    }

    const automaticCohostUserIds = [
      docentePrograma.docente.usuarioId,
      ...(assistant ? [assistant.usuarioId] : [])
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
        select: { id: true, prioridad: true }
      }),
      tx.eventoProveedor.findMany({
        where: {
          proveedorId: proveedorMeet.id,
          cuentaProveedorId: { not: null },
          instancia: {
            estado: "PROGRAMADA",
            OR: input.instancias.map(({ inicio, fin }) => ({
              inicioProgramadoAt: { lt: fin },
              finProgramadoAt: { gt: inicio }
            }))
          }
        },
        select: { cuentaProveedorId: true }
      })
    ]);
    if (cohosts.length !== new Set(input.cohostCuentaIds).size) {
      throw new Error("Una o mas cuentas cohost no existen.");
    }
    const cohostIds = [...new Set([...cohosts, ...automaticCohosts].map(({ id }) => id))];
    const occupiedHostIds = new Set(
      occupiedHosts.flatMap(({ cuentaProveedorId }) => cuentaProveedorId ? [cuentaProveedorId] : [])
    );
    const cuentaHost = hosts.find(({ id }) => !occupiedHostIds.has(id));
    if (!cuentaHost) {
      throw new Error("No hay una sala Meet libre para todas las fechas solicitadas.");
    }
    const manualCohostEmails = withRequiredCohostEmails(input.cohostEmailsManual);
    const startTimes = input.instancias.map(({ inicio }) => inicio.getTime());
    const endTimes = input.instancias.map(({ fin }) => fin.getTime());
    const solicitud = await tx.solicitudSala.create({
      data: {
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
        requiereAsistencia: input.requiereAsistencia,
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
            inicioProgramadoAt: fecha.inicio,
            finProgramadoAt: fecha.fin,
            timezone: input.timezone,
            requiereAsistencia: input.requiereAsistencia,
            requiereGrabacion: input.requiereGrabacion,
          },
        });
        const evento = await tx.eventoProveedor.create({
          data: {
            instanciaSalaId: instancia.id,
            proveedorId: proveedorMeet.id,
            cuentaProveedorId: cuentaHost.id,
            codigoReunion: input.codigoMeet,
          },
        });
        if (cohostIds.length > 0) {
          await tx.cohostReunion.createMany({
            data: cohostIds.map((id) => ({
              instanciaSalaId: instancia.id,
              cuentaGoogleId: id,
            })),
          });
        }
        if (manualCohostEmails.length > 0) {
          await tx.cohostEmailReunion.createMany({
            data: manualCohostEmails.map((email) => ({
              instanciaSalaId: instancia.id,
              email
            }))
          });
        }
        if (asistenteId) {
          await tx.asignacionAsistente.create({
            data: {
              instanciaSalaId: instancia.id,
              asistenteId,
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
    };
  });
}
