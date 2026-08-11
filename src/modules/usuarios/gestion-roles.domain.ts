import { z } from "zod";
import { ROLES_USUARIO, type RolUsuario } from "./roles";

export const cambiarRolUsuarioSchema = z.object({
  rol: z.enum(ROLES_USUARIO)
});

export type ActorGestionRoles = Readonly<{
  id: string;
  rol: RolUsuario;
  activo: boolean;
}>;

export function puedeGestionarRoles(actor: ActorGestionRoles): boolean {
  return actor.activo && actor.rol === "ADMINISTRACION";
}

export function requierePerfilDocente(rol: RolUsuario): boolean {
  return rol === "DOCENTE";
}

export function requierePerfilAsistente(rol: RolUsuario): boolean {
  return rol === "ASISTENTE_TECNICO";
}
