import { z } from "zod";
import { errorParaPanel } from "../../lib/http/api-error";
import type { RolUsuario } from "../usuarios/roles";

const privateKeySchema = z
  .string()
  .trim()
  .transform((value) => value.replaceAll("\\n", "\n"))
  .refine(
    (value) => value.startsWith("-----BEGIN PRIVATE KEY-----") && value.endsWith("-----END PRIVATE KEY-----"),
    "El private key no tiene formato PEM valido."
  );

const credentialIdSchema = z
  .string()
  .trim()
  .min(1)
  .max(160)
  .refine(
    (value) => value === "principal" || value.startsWith("legacy:"),
    "Identificador de credencial inválido."
  );

export const googleServiceAccountKeySchema = z
  .object({
    type: z.literal("service_account", {
      message: 'El JSON debe tener type: "service_account".'
    }),
    project_id: z.string().trim().min(1, "El JSON debe incluir project_id.").optional(),
    private_key_id: z.string().trim().optional(),
    private_key: privateKeySchema,
    client_email: z.string().trim().email("El JSON debe incluir un client_email válido."),
    client_id: z.string().trim().optional(),
    auth_uri: z.string().optional(),
    token_uri: z.string().optional(),
    auth_provider_x509_cert_url: z.string().optional(),
    client_x509_cert_url: z.string().optional(),
    universe_domain: z.string().optional()
  })
  .passthrough();

export type GoogleServiceAccountKey = Readonly<z.infer<typeof googleServiceAccountKeySchema>>;

export function parseServiceAccountKeyJson(input: unknown): GoogleServiceAccountKey {
  if (input === null || input === undefined) {
    throw new Error("El archivo JSON de cuenta de servicio es obligatorio.");
  }
  if (typeof input === "string") {
    const trimmed = input.trim();
    if (!trimmed) {
      throw new Error("El archivo JSON de cuenta de servicio no puede estar vacío.");
    }
    const parsed = (() => {
      try {
        return JSON.parse(trimmed);
      } catch {
        throw new Error("El contenido proporcionado no es un JSON válido.");
      }
    })();
    if (typeof parsed !== "object" || parsed === null || Array.isArray(parsed)) {
      throw new Error("El archivo JSON de cuenta de servicio debe ser un objeto JSON válido.");
    }
    return googleServiceAccountKeySchema.parse(parsed);
  }
  if (typeof input !== "object" || Array.isArray(input)) {
    throw new Error("El archivo JSON de cuenta de servicio debe ser un objeto JSON válido.");
  }
  return googleServiceAccountKeySchema.parse(input);
}

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
    credentialId: credentialIdSchema.default("principal"),
    serviceAccountJson: z.unknown().transform((val, ctx) => {
      try {
        return parseServiceAccountKeyJson(val);
      } catch (error) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          message:
            error instanceof Error ? error.message : "El archivo JSON de cuenta de servicio no es válido."
        });
        return z.NEVER;
      }
    })
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
  objetivo: z.enum(["CREDENCIAL", "DELEGACION", "SCOPES", "DRIVE"]),
  credentialId: credentialIdSchema.optional()
});

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
  if (normalized.includes("invalid_client")) {
    return "Google no reconoce la cuenta de servicio configurada. Revisá que el email y la clave privada pertenezcan a una cuenta de servicio vigente del mismo proyecto.";
  }
  if (normalized.includes("unauthorized_client")) {
    return "Google rechazó la delegación. En la Consola de administración autorizá el ID numérico del cliente de la cuenta de servicio con los scopes requeridos. No uses el email como ID de cliente.";
  }
  if (normalized.includes("delegation denied")) {
    return "Google denegó la delegación del dominio. Revisá el ID numérico del cliente, el usuario delegado y los scopes autorizados.";
  }
  if (
    normalized.includes("insufficient authentication scopes") ||
    normalized.includes("insufficient oauth")
  ) {
    return "Faltan scopes OAuth en la delegación de todo el dominio. Usá Validar scopes en Configuración → Google Workspace para identificar cuáles faltan.";
  }
  if (normalized.includes("insufficient") || normalized.includes("permission")) {
    return "Google autenticó la cuenta, pero la operación no tiene permisos suficientes. Revisá los scopes y los permisos del usuario delegado sobre el recurso.";
  }
  return errorParaPanel(error, "No se pudo completar la prueba con Google.").message;
}
