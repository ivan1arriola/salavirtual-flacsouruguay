import type { PrismaClient } from "@prisma/client";
import type {
  AssistantCalendarRepositoryPort,
  CredencialesWorkspaceCalendar,
  InstanciaParaCalendario,
} from "../../ports";

export type PrismaAssistantCalendarRepositoryOptions = Readonly<{
  db: PrismaClient;
  descifrar: (value: string) => string;
}>;

export function crearPrismaAssistantCalendarRepository(
  options: PrismaAssistantCalendarRepositoryOptions
): AssistantCalendarRepositoryPort {
  const { db, descifrar } = options;

  return {
    async obtenerInstanciaParaCalendario(
      instanciaSalaId: string
    ): Promise<InstanciaParaCalendario | null> {
      const meeting = await db.instanciaSala.findUnique({
        where: { id: instanciaSalaId },
        select: {
          id: true,
          estado: true,
          requiereAsistenciaTecnica: true,
          inicioProgramadoAt: true,
          finProgramadoAt: true,
          timezone: true,
          descripcion: true,
          solicitud: {
            select: {
              titulo: true,
              descripcion: true,
              docentePrograma: {
                select: {
                  programa: { select: { nombre: true } },
                  docente: {
                    select: {
                      usuario: { select: { nombres: true, apellidos: true } },
                    },
                  },
                },
              },
            },
          },
          eventosProveedor: {
            where: { proveedor: { tipo: "GOOGLE_MEET" } },
            select: { joinUrl: true },
            take: 1,
          },
          asignaciones: {
            select: {
              id: true,
              estado: true,
              asistenteTecnico: {
                select: {
                  usuario: {
                    select: {
                      rol: true,
                      activo: true,
                      fusionadoEnId: true,
                      cuentasGoogle: {
                        select: {
                          id: true,
                          email: true,
                          dominio: true,
                          providerAccountId: true,
                          emailVerificadoAt: true,
                        },
                      },
                    },
                  },
                },
              },
            },
          },
        },
      });

      if (!meeting) return null;

      const docente =
        [
          meeting.solicitud.docentePrograma.docente.usuario.nombres,
          meeting.solicitud.docentePrograma.docente.usuario.apellidos,
        ]
          .filter(Boolean)
          .join(" ") || null;

      return {
        id: meeting.id,
        estado: meeting.estado,
        requiereAsistenciaTecnica: meeting.requiereAsistenciaTecnica,
        inicioProgramadoAt: meeting.inicioProgramadoAt,
        finProgramadoAt: meeting.finProgramadoAt,
        timezone: meeting.timezone,
        descripcion: meeting.descripcion,
        solicitudTitulo: meeting.solicitud.titulo,
        solicitudDescripcion: meeting.solicitud.descripcion,
        programaNombre: meeting.solicitud.docentePrograma.programa.nombre,
        docenteNombreCompleto: docente,
        joinUrl: meeting.eventosProveedor[0]?.joinUrl ?? null,
        asignaciones: meeting.asignaciones,
      };
    },

    async obtenerInstanciasDeSolicitud(
      solicitudSalaId: string
    ): Promise<readonly string[]> {
      const instances = await db.instanciaSala.findMany({
        where: { solicitudSalaId },
        select: { id: true },
      });
      return instances.map((instance) => instance.id);
    },

    async obtenerInstanciasDeAsistente(
      usuarioId: string
    ): Promise<readonly string[]> {
      const assistant = await db.asistenteTecnico.findUnique({
        where: { usuarioId },
        select: {
          asignaciones: {
            where: { estado: { in: ["ASIGNADO", "ACEPTADO"] } },
            select: { instanciaSalaId: true },
          },
        },
      });

      if (!assistant) return [];
      return [...new Set(assistant.asignaciones.map((a) => a.instanciaSalaId))];
    },

    async obtenerInstanciasFuturasParaReconciliar(
      now: Date
    ): Promise<readonly string[]> {
      const instances = await db.instanciaSala.findMany({
        where: {
          finProgramadoAt: { gte: now },
          asignaciones: { some: {} },
        },
        select: { id: true },
        orderBy: { inicioProgramadoAt: "asc" },
      });
      return instances.map((instance) => instance.id);
    },

    async obtenerCredencialesWorkspace(): Promise<CredencialesWorkspaceCalendar | null> {
      const config = await db.configuracionGoogleWorkspace.findUnique({
        where: { id: "principal" },
        select: {
          activa: true,
          serviceAccountEmail: true,
          privateKeyCifrada: true,
        },
      });

      if (
        !config?.activa ||
        !config.serviceAccountEmail ||
        !config.privateKeyCifrada
      ) {
        return null;
      }

      try {
        const privateKey = descifrar(config.privateKeyCifrada);
        return {
          serviceAccountEmail: config.serviceAccountEmail,
          privateKey,
        };
      } catch {
        return null;
      }
    },
  };
}

