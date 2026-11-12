import type { PrismaClient } from "@prisma/client";
import { normalizarConfiguracionCorreoSes, type ConfiguracionCorreoSesInput } from "./correo-ses.domain";

export type ActorCorreoSes = Readonly<{ id: string; rol: string; activo: boolean }>;
type CorreoSesDb = Pick<PrismaClient, "configuracionCorreoSes">;

export async function obtenerConfiguracionCorreoSes(db: CorreoSesDb) {
  return db.configuracionCorreoSes.findUnique({ where: { id: "principal" } });
}

export async function actualizarConfiguracionCorreoSes(
  db: PrismaClient,
  actor: ActorCorreoSes,
  input: unknown
) {
  if (!esAdminActivo(actor)) {
    throw new Error("Solo Administración puede configurar el correo.");
  }
  const config: ConfiguracionCorreoSesInput = normalizarConfiguracionCorreoSes(input);
  return db.$transaction(async (tx) => {
    const actualActor = await tx.usuario.findUnique({
      where: { id: actor.id },
      select: { id: true, rol: true, activo: true }
    });
    if (!actualActor || !esAdminActivo(actualActor)) {
      throw new Error("La sesión no corresponde a un usuario vigente de Administración.");
    }

    const actual = await tx.configuracionCorreoSes.findUnique({ where: { id: "principal" } });
    const saved = await tx.configuracionCorreoSes.upsert({
      where: { id: "principal" },
      create: { id: "principal", ...config, actualizadaPorId: actualActor.id },
      update: { ...config, actualizadaPorId: actualActor.id }
    });
    await tx.auditoria.create({
      data: {
        actorUsuarioId: actualActor.id,
        accion: "CONFIGURACION_CORREO_SES_ACTUALIZADA",
        entidadTipo: "ConfiguracionCorreoSes",
        entidadId: "principal",
        valorAnterior: actual
          ? {
              awsRegion: actual.awsRegion,
              fromEmail: actual.fromEmail,
              replyToEmail: actual.replyToEmail,
              activa: actual.activa
            }
          : undefined,
        valorNuevo: config
      }
    });
    return saved;
  });
}

export async function obtenerConfiguracionCorreoSesActiva(db: CorreoSesDb) {
  const config = await obtenerConfiguracionCorreoSes(db);
  if (!config?.activa || !config.awsRegion || !config.fromEmail) {
    return null;
  }
  return { awsRegion: config.awsRegion, fromEmail: config.fromEmail, replyToEmail: config.replyToEmail };
}

function esAdminActivo(actor: Pick<ActorCorreoSes, "rol" | "activo">): boolean {
  return actor.activo && actor.rol === "ADMINISTRACION";
}
