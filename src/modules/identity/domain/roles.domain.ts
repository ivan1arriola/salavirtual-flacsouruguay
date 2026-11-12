import { ROLES_USUARIO, type RolUsuario } from "./identity.types";

const MAPEO_ROLES_ANTERIORES: Readonly<Record<string, RolUsuario>> = Object.freeze({
  ADMINISTRADOR: "ADMINISTRACION",
  CONTADURIA: "ADMINISTRACION",
  SOPORTE_ZOOM: "ASISTENTE_TECNICO",
  ASISTENTE_ZOOM: "ASISTENTE_TECNICO",
  DOCENTE: "DOCENTE"
});

export function buscarRolAnterior(rol: string): RolUsuario | null {
  return MAPEO_ROLES_ANTERIORES[rol.trim().toUpperCase()] ?? null;
}

export function mapearRolAnterior(rol: string): RolUsuario {
  const rolNuevo = buscarRolAnterior(rol);
  if (!rolNuevo) {
    throw new Error(`Rol anterior desconocido: ${rol}`);
  }
  return rolNuevo;
}

export function puedeAdministrar(rol: RolUsuario): boolean {
  return rol === "ADMINISTRACION";
}

export function esRolUsuario(valor: unknown): valor is RolUsuario {
  return typeof valor === "string" && ROLES_USUARIO.some((rol) => rol === valor);
}
