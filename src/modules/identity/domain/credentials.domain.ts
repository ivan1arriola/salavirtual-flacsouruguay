import { z } from "zod";
import type { UsuarioAutenticado, UsuarioCredenciales } from "./identity.types";

export const credencialesLoginSchema = z.object({
  usuario: z.string().trim().min(1).transform(normalizarIdentificadorAcceso),
  password: z.string().min(1),
});

export function normalizarIdentificadorAcceso(valor: string): string {
  const identificador = valor.trim();
  return identificador.includes("@") ? identificador.toLowerCase() : identificador;
}

export function esCorreoAcceso(valor: string): boolean {
  return valor.includes("@");
}

export function evaluarAccesoLocal(
  usuario: UsuarioCredenciales | null,
  passwordValida: boolean,
): UsuarioAutenticado | null {
  if (!usuario || !passwordValida || !usuario.activo || usuario.fusionadoEnId) {
    return null;
  }

  return {
    id: usuario.id,
    rol: usuario.rol,
    nombre: usuario.nombre,
    email: usuario.email,
    debeCambiarPassword: usuario.debeCambiarPassword,
  };
}
