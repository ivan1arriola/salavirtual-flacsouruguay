import type { PrismaClient } from "@prisma/client";
import {
  crearReunionesSchema,
  diasDeReunion,
  puedeCrearReuniones,
} from "./reuniones.domain";
import type { RolUsuario } from "../usuarios/roles";

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

  return db.$transaction(async (tx) => {
    const [docentePrograma, cuentaHost, proveedorMeet] = await Promise.all([
      tx.docentePrograma.findUnique({
        where: { id: input.docenteProgramaId },
        include: {
          docente: { select: { usuarioId: true } },
        },
      }),
      tx.cuentaProveedor.findUnique({
        where: { id: input.cuentaHostId },
      }),
      tx.proveedorReunion.findUnique({
        where: { tipo: "GOOGLE_MEET" },
      }),
    ]);
    if (!docentePrograma?.activo) {
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
    if (
      !cuentaHost?.activa ||
      !cuentaHost.tieneLicencia ||
      cuentaHost.proveedorId !== proveedorMeet?.id
    ) {
      throw new Error(
        "La cuenta host debe ser una cuenta Meet activa con licencia.",
      );
    }

    const cohosts = await tx.cuentaGoogleFlacso.findMany({
      where: { id: { in: input.cohostCuentaIds } },
      select: { id: true },
    });
    if (cohosts.length !== new Set(input.cohostCuentaIds).size) {
      throw new Error("Una o mas cuentas cohost no existen.");
    }
    if (input.asistenteId) {
      const asistente = await tx.asistente.findUnique({
        where: { id: input.asistenteId },
      });
      if (!asistente) throw new Error("El asistente seleccionado no existe.");
    }

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
        if (cohosts.length > 0) {
          await tx.cohostReunion.createMany({
            data: cohosts.map(({ id }) => ({
              instanciaSalaId: instancia.id,
              cuentaGoogleId: id,
            })),
          });
        }
        if (input.asistenteId) {
          await tx.asignacionAsistente.create({
            data: {
              instanciaSalaId: instancia.id,
              asistenteId: input.asistenteId,
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
