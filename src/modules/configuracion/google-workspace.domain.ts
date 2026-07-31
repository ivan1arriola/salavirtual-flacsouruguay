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
