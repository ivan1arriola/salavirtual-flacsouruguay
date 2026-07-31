import { z } from "zod";
import type { RolUsuario } from "../usuarios/roles";

export const configuracionGoogleWorkspaceSchema = z.object({
  serviceAccountEmail: z.email(),
  privateKey: z
    .string()
    .trim()
    .transform((value) => value.replaceAll("\\n", "\n"))
    .refine(
      (value) =>
        value.startsWith("-----BEGIN PRIVATE KEY-----") &&
        value.endsWith("-----END PRIVATE KEY-----"),
      "El private key no tiene formato PEM valido."
    ),
  serviceAccountSubject: z.email(),
  driveDestinationId: z.string().trim().min(1),
  activa: z.boolean().default(true)
});

export type ConfiguracionGoogleWorkspaceInput = Readonly<
  z.infer<typeof configuracionGoogleWorkspaceSchema>
>;

export type ActorConfiguracion = Readonly<{
  id: string;
  rol: RolUsuario;
  activo: boolean;
}>;

export function puedeConfigurarGoogleWorkspace(actor: ActorConfiguracion): boolean {
  return actor.activo && actor.rol === "ADMINISTRACION";
}
