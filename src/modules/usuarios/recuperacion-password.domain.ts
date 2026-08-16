import { createHash } from "node:crypto";
import { z } from "zod";

export const RECUPERACION_PASSWORD_TTL_MS = 30 * 60 * 1000;
export const RECUPERACION_PASSWORD_REENVIO_MS = 2 * 60 * 1000;
export const RECUPERACION_PASSWORD_IDENTIFIER_PREFIX = "password-reset:";

export const solicitudRecuperacionPasswordSchema = z.object({
  email: z.string().trim().email("Ingresá un correo electrónico válido.").transform((value) => value.toLowerCase())
});

export const restablecerPasswordSchema = z.object({
  token: z.string().trim().min(32, "El enlace de recuperación no es válido.").max(500),
  passwordNueva: z.string().min(8, "La contraseña debe tener al menos 8 caracteres.").max(72),
  confirmarPassword: z.string().max(72)
}).refine(({ passwordNueva, confirmarPassword }) => passwordNueva === confirmarPassword, {
  message: "Las contraseñas no coinciden.",
  path: ["confirmarPassword"]
});

export function hashTokenRecuperacion(token: string): string {
  return createHash("sha256").update(token, "utf8").digest("hex");
}

export function identifierRecuperacionPassword(usuarioId: string): string {
  return `${RECUPERACION_PASSWORD_IDENTIFIER_PREFIX}${usuarioId}`;
}

export function usuarioIdDesdeIdentifierRecuperacion(identifier: string): string | null {
  return identifier.startsWith(RECUPERACION_PASSWORD_IDENTIFIER_PREFIX)
    ? identifier.slice(RECUPERACION_PASSWORD_IDENTIFIER_PREFIX.length) || null
    : null;
}

export function tokenRecuperacionVigente(
  token: Readonly<{ expires: Date }>,
  ahora: Date
): boolean {
  return token.expires.getTime() > ahora.getTime();
}
