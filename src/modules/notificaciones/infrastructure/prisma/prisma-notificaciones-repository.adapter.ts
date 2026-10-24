import type { Prisma, PrismaClient } from "@prisma/client";
import { obtenerCredencialPrincipalGoogleWorkspace } from "@/src/modules/configuracion/api";
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

    async guardarNotificacionEnBandeja(data): Promise<string> {
      const saved = await db.notificacion.create({
        data: {
          usuarioId: data.usuarioId,
          tipo: data.tipo,
          titulo: data.titulo,
          cuerpo: data.cuerpo,
          href: data.href,
          metadata: (data.metadata as Prisma.InputJsonValue) ?? undefined,
        },
        select: { id: true },
      });
      return saved.id;
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

    async registrarResultadoCorreo(resultado): Promise<void> {
      // Auditoría sin dirección de correo, asunto, texto ni credenciales.
      await db.auditoria.create({
        data: {
          accion: "NOTIFICACION_CORREO_ESTADO",
          entidadTipo: "Notificacion",
          entidadId: resultado.notificacionId ?? resultado.usuarioId,
          valorNuevo: {
            usuarioId: resultado.usuarioId,
            tipo: resultado.tipo,
            estado: resultado.estado,
            ...(resultado.transporte ? { transporte: resultado.transporte } : {}),
            ...(resultado.motivo ? { motivo: resultado.motivo } : {})
          }
        }
      });
    },

    async obtenerCredencialesGmail(): Promise<CredencialGmailTransport | null> {
      const cred = await obtenerCredencialPrincipalGoogleWorkspace(db, descifrar, { requireActiva: true });
      if (!cred?.serviceAccountSubject) return null;
      return {
        serviceAccountEmail: cred.serviceAccountEmail,
        privateKey: cred.privateKey,
        subject: cred.serviceAccountSubject,
      };
    },
  };
}

