import type { PrismaClient } from "@prisma/client";
import { z } from "zod";

export const zoomConfigSchema = z.object({
  accountId: z.string().trim().min(1, "El Account ID es obligatorio."),
  clientId: z.string().trim().min(1, "El Client ID es obligatorio."),
  clientSecret: z.string().trim().min(1, "El Client Secret es obligatorio.").optional(),
  activa: z.boolean().default(true),
});

export type ZoomCredentialsResolved =
  | Readonly<{
      disponible: true;
      accountId: string;
      clientId: string;
      clientSecret: string;
      origen: "DATABASE" | "ENV";
    }>
  | Readonly<{
      disponible: false;
      error: string;
      diagnostico: "AUSENTES" | "ERROR_COMPROBACION";
    }>;

export async function obtenerCredencialesZoom(
  db: PrismaClient,
  descifrar: (cifrado: string) => string,
): Promise<ZoomCredentialsResolved> {
  let errorComprobacion = false;
  try {
    const config = await db.configuracionZoom.findUnique({
      where: { id: "principal" },
    });

    if (config?.activa && config.accountId && config.clientId && config.clientSecretCifrado) {
      try {
        const clientSecret = descifrar(config.clientSecretCifrado);
        return {
          disponible: true,
          accountId: config.accountId,
          clientId: config.clientId,
          clientSecret,
          origen: "DATABASE",
        };
      } catch {
        errorComprobacion = true;
        // Fallback a env si falla descifrado
      }
    }
  } catch {
    errorComprobacion = true;
    // Si la tabla no existe en algún test unitario
  }

  const envAccountId = process.env["ZOOM_ACCOUNT_ID"]?.trim();
  const envClientId = process.env["ZOOM_CLIENT_ID"]?.trim();
  const envClientSecret = process.env["ZOOM_CLIENT_SECRET"]?.trim();

  if (envAccountId && envClientId && envClientSecret) {
    return {
      disponible: true,
      accountId: envAccountId,
      clientId: envClientId,
      clientSecret: envClientSecret,
      origen: "ENV",
    };
  }

  return {
    disponible: false,
    error: errorComprobacion
      ? "No se pudieron comprobar las credenciales Zoom."
      : "No hay credenciales Zoom activas y completas disponibles.",
    diagnostico: errorComprobacion ? "ERROR_COMPROBACION" : "AUSENTES",
  };
}

export async function guardarConfiguracionZoom(
  db: PrismaClient,
  cifrar: (plano: string) => string,
  actorUsuarioId: string,
  rawInput: unknown,
): Promise<Readonly<{ ok: true; message: string }>> {
  const input = zoomConfigSchema.parse(rawInput);

  const existing = await db.configuracionZoom.findUnique({
    where: { id: "principal" },
  });

  if (!input.clientSecret && !existing?.clientSecretCifrado) {
    throw new Error("El Client Secret es obligatorio para la primera configuración.");
  }

  const clientSecretCifrado = input.clientSecret
    ? cifrar(input.clientSecret)
    : existing?.clientSecretCifrado;

  await db.configuracionZoom.upsert({
    where: { id: "principal" },
    create: {
      id: "principal",
      accountId: input.accountId,
      clientId: input.clientId,
      clientSecretCifrado,
      activa: input.activa,
      actualizadaPorId: actorUsuarioId,
    },
    update: {
      accountId: input.accountId,
      clientId: input.clientId,
      ...(clientSecretCifrado ? { clientSecretCifrado } : {}),
      activa: input.activa,
      actualizadaPorId: actorUsuarioId,
    },
  });

  await db.auditoria.create({
    data: {
      actorUsuarioId,
      accion: "CONFIGURACION_ZOOM_ACTUALIZADA",
      entidadTipo: "ConfiguracionZoom",
      entidadId: "principal",
      valorNuevo: {
        accountId: input.accountId,
        clientId: input.clientId,
        activa: input.activa,
        clientSecretActualizado: Boolean(input.clientSecret),
      },
    },
  });

  return { ok: true, message: "Configuración de Zoom guardada correctamente." };
}
