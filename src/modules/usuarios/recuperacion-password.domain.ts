import { createHash } from "node:crypto";
import { z } from "zod";

export const RECUPERACION_PASSWORD_TTL_MS = 30 * 60 * 1000;
export const RECUPERACION_PASSWORD_REENVIO_MS = 2 * 60 * 1000;

export const solicitudRecuperacionPasswordSchema = z.object({
  email: z.email("Ingresá un correo electrónico válido.").trim().transform((value) => value.toLowerCase())
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

export function tokenRecuperacionVigente(
  token: Readonly<{ expiraAt: Date; utilizadoAt: Date | null }>,
  ahora = new Date()
): boolean {
  return token.utilizadoAt === null && token.expiraAt.getTime() > ahora.getTime();
}
