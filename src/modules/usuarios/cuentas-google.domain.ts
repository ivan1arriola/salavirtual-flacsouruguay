import { z } from "zod";
import type { RolUsuario } from "./roles";

const emailGoogleSchema = z
  .email()
  .transform((email) => email.trim().toLowerCase());

const emailPrincipalSchema = z.union([
  z
    .string()
    .transform((email) => email.trim().toLowerCase())
    .pipe(z.email()),
  z.null()
]);

export const reemplazarCuentasGoogleSchema = z.object({
  emails: z.array(emailGoogleSchema).transform((emails) => [...new Set(emails)]),
  emailPrincipal: emailPrincipalSchema.optional()
});

export type ActorGestionUsuarios = Readonly<{
  id: string;
  rol: RolUsuario;
  activo: boolean;
}>;

export type EstadoAccesoUsuario = Readonly<{
  tienePassword: boolean;
  cantidadCuentasGoogle: number;
}>;

export type ResolucionEmailPrincipal = Readonly<{
  emailsGoogle: readonly string[];
  emailPrincipalActual: string | null;
  emailPrincipalSolicitado?: string | null;
}>;

export function puedeGestionarCuentasGoogle(actor: ActorGestionUsuarios): boolean {
  return actor.activo && actor.rol === "ADMINISTRACION";
}

export function tieneMetodoDeAcceso(estado: EstadoAccesoUsuario): boolean {
  return estado.tienePassword || estado.cantidadCuentasGoogle > 0;
}

export function resolverEmailPrincipal(input: ResolucionEmailPrincipal): string | null {
  const emailActual = input.emailPrincipalActual?.trim().toLowerCase() ?? null;

  if (input.emailsGoogle.length > 0) {
    return emailActual && input.emailsGoogle.includes(emailActual)
      ? emailActual
      : input.emailsGoogle[0] ?? null;
  }

  if (input.emailPrincipalSolicitado !== undefined) {
    return input.emailPrincipalSolicitado;
  }

  return emailActual;
}
