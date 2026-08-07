import type { RolUsuario } from "../usuarios/roles";

export function puedeVerHistoricoZoom(rol: RolUsuario): boolean {
  return rol === "ADMINISTRACION";
}
