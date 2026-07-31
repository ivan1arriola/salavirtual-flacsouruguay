import { z } from "zod";
import type { RolUsuario } from "../usuarios/roles";

const privateKeySchema = z
  .string()
  .trim()
  .transform((value) => value.replaceAll("\\n", "\n"))
  .refine(
    (value) =>
      value.startsWith("-----BEGIN PRIVATE KEY-----") &&
      value.endsWith("-----END PRIVATE KEY-----"),
    "El private key no tiene formato PEM valido."
  );

export const configuracionGoogleWorkspaceSchema = z.object({
  serviceAccountEmail: z.email(),
  privateKey: privateKeySchema,
  serviceAccountSubject: z.email(),
  driveDestinationId: z.string().trim().min(1),
  activa: z.boolean().default(true)
});

export const seccionConfiguracionGoogleWorkspaceSchema = z.discriminatedUnion("seccion", [
  z.object({
    seccion: z.literal("CREDENCIAL"),
    serviceAccountEmail: z.email(),
    privateKey: z.preprocess(
      (value) =>
        typeof value === "string" && value.trim() === "" ? undefined : value,
      privateKeySchema.optional()
    )
  }),
  z.object({
    seccion: z.literal("DELEGACION"),
    serviceAccountSubject: z.email()
  }),
  z.object({
    seccion: z.literal("DRIVE"),
    driveDestinationId: z.string().trim().min(1)
  }),
  z.object({
    seccion: z.literal("ESTADO"),
    activa: z.boolean()
  })
]);

export const pruebaConfiguracionGoogleWorkspaceSchema = z.object({
  objetivo: z.enum(["CREDENCIAL", "DELEGACION", "DRIVE"])
});

export type ConfiguracionGoogleWorkspaceInput = Readonly<
  z.infer<typeof configuracionGoogleWorkspaceSchema>
>;

export type SeccionConfiguracionGoogleWorkspaceInput = Readonly<
  z.infer<typeof seccionConfiguracionGoogleWorkspaceSchema>
>;

export type ActorConfiguracion = Readonly<{
  id: string;
  rol: RolUsuario;
  activo: boolean;
}>;

export function puedeConfigurarGoogleWorkspace(actor: ActorConfiguracion): boolean {
  return actor.activo && actor.rol === "ADMINISTRACION";
}

export function mensajeErrorGoogleWorkspace(error: unknown): string {
  const message = error instanceof Error ? error.message : String(error);
  const normalized = message.toLowerCase();
  if (normalized.includes("unauthorized_client")) {
    return "Google rechazó la delegación. En la Consola de administración autorizá el ID numérico del cliente de la cuenta de servicio con estos scopes: https://www.googleapis.com/auth/calendar.events, https://www.googleapis.com/auth/drive, https://www.googleapis.com/auth/meetings.space.settings y https://www.googleapis.com/auth/meetings.space.readonly. No uses el email como ID de cliente.";
  }
  if (normalized.includes("delegation denied")) {
    return "Google denegó la delegación del dominio. Revisá el ID numérico del cliente, el usuario delegado y los scopes autorizados.";
  }
  if (normalized.includes("insufficient") || normalized.includes("permission")) {
    return "Google autenticó la cuenta, pero no puede escribir en la carpeta. Dale acceso de editor al usuario delegado y a las cuentas sala01 a sala10.";
  }
  return message || "No se pudo completar la prueba con Google.";
}
