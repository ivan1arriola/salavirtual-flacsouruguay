import { z } from "zod";
import type { RolUsuario } from "./roles";

export const credencialesLoginSchema = z.object({
  usuario: z.string().trim().min(1),
  password: z.string().min(1)
});

export type UsuarioCredenciales = Readonly<{
  id: string;
  passwordHash: string | null;
  rol: RolUsuario;
  activo: boolean;
  fusionadoEnId: string | null;
  nombre: string | null;
  email: string | null;
}>;

export type UsuarioAutenticado = Readonly<{
  id: string;
  rol: RolUsuario;
  nombre: string | null;
  email: string | null;
}>;

export function evaluarAccesoLocal(
  usuario: UsuarioCredenciales | null,
  passwordValida: boolean
): UsuarioAutenticado | null {
  if (!usuario || !passwordValida || !usuario.activo || usuario.fusionadoEnId) {
    return null;
  }

  return {
    id: usuario.id,
    rol: usuario.rol,
    nombre: usuario.nombre,
    email: usuario.email
  };
}
