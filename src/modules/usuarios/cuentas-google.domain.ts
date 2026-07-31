import { z } from "zod";
import type { RolUsuario } from "./roles";

const emailFlacsoSchema = z
  .email()
  .transform((email) => email.trim().toLowerCase())
  .refine((email) => email.endsWith("@flacso.edu.uy"), {
    message: "Solo se permiten cuentas del dominio flacso.edu.uy."
  });

export const reemplazarCuentasGoogleSchema = z.object({
  emails: z.array(emailFlacsoSchema).transform((emails) => [...new Set(emails)])
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

export function puedeGestionarCuentasGoogle(actor: ActorGestionUsuarios): boolean {
  return actor.activo && actor.rol === "ADMINISTRACION";
}

export function tieneMetodoDeAcceso(estado: EstadoAccesoUsuario): boolean {
  return estado.tienePassword || estado.cantidadCuentasGoogle > 0;
}

export function debeCambiarPassword(estado: EstadoAccesoUsuario): boolean {
  return estado.cantidadCuentasGoogle === 0;
}
