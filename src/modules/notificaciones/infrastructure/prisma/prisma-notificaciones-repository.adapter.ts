import type { Prisma, PrismaClient } from "@prisma/client";
import {
  PREFERENCIA_PREDETERMINADA,
  type NotificationRecipient,
  type PreferenciaCanales,
  type TipoNotificacion,
} from "../../domain";
import type {
  CredencialGmailTransport,
  NotificacionesRepositoryPort,
} from "../../ports";

type Db = PrismaClient | Prisma.TransactionClient;

export type PrismaNotificacionesRepositoryOptions = Readonly<{
  db: Db;
  descifrar: (value: string) => string;
}>;

export function crearPrismaNotificacionesRepository(
  options: PrismaNotificacionesRepositoryOptions
): NotificacionesRepositoryPort {
  const { db, descifrar } = options;

  return {
    async obtenerPreferencias(
      usuarioId: string,
      tipo: TipoNotificacion
    ): Promise<PreferenciaCanales> {
      const preference = await db.preferenciaNotificacion.findUnique({
        where: { usuarioId_tipo: { usuarioId, tipo } },
        select: { push: true, email: true },
      });
      return preference ?? PREFERENCIA_PREDETERMINADA;
    },

    async guardarNotificacionEnBandeja(data): Promise<void> {
      await db.notificacion.create({
        data: {
          usuarioId: data.usuarioId,
          tipo: data.tipo,
          titulo: data.titulo,
          cuerpo: data.cuerpo,
          href: data.href,
          metadata: (data.metadata as Prisma.InputJsonValue) ?? undefined,
        },
      });
    },

    async esAsistenteCesado(usuarioId: string): Promise<boolean> {
      const assistant = await db.asistenteTecnico.findFirst({
        where: {
          usuarioId,
          cesadoHastaProximoInicioSesion: true,
          usuario: { rol: "ASISTENTE_TECNICO" },
        },
        select: { id: true },
      });
      return Boolean(assistant);
    },

    async obtenerDestinatariosDocentesPrograma(
      solicitudId: string
    ): Promise<readonly NotificationRecipient[]> {
      const request = await db.solicitudSala.findUnique({
        where: { id: solicitudId },
        select: { docentePrograma: { select: { programaId: true } } },
      });

      if (!request) return [];

      const associations = await db.docentePrograma.findMany({
        where: {
          programaId: request.docentePrograma.programaId,
          activo: true,
          programa: { activo: true },
          docente: { usuario: { activo: true, rol: "DOCENTE" } },
        },
        select: {
          docente: {
            select: {
              usuario: { select: { id: true, emailPrincipal: true } },
            },
          },
        },
      });

      return Array.from(
        new Map(
          associations.map(({ docente }) => [
            docente.usuario.id,
            {
              usuarioId: docente.usuario.id,
              email: docente.usuario.emailPrincipal,
            },
          ])
        ).values()
      );
    },

    async obtenerAdministradoresActivos(): Promise<readonly NotificationRecipient[]> {
      const admins = await db.usuario.findMany({
        where: { rol: "ADMINISTRACION", activo: true },
        select: { id: true, emailPrincipal: true },
      });

      return admins.map((admin) => ({
        usuarioId: admin.id,
        email: admin.emailPrincipal,
      }));
    },

    async obtenerCredencialesGmail(): Promise<CredencialGmailTransport | null> {
      const configuration = await db.configuracionGoogleWorkspace.findUnique({
        where: { id: "principal" },
        select: {
          serviceAccountEmail: true,
          privateKeyCifrada: true,
          serviceAccountSubject: true,
          activa: true,
        },
      });

      if (
        !configuration?.activa ||
        !configuration.serviceAccountEmail ||
        !configuration.privateKeyCifrada ||
        !configuration.serviceAccountSubject
      ) {
        return null;
      }

      try {
        const privateKey = descifrar(configuration.privateKeyCifrada);
        return {
          serviceAccountEmail: configuration.serviceAccountEmail,
          privateKey,
          subject: configuration.serviceAccountSubject,
        };
      } catch {
        return null;
      }
    },
  };
}

