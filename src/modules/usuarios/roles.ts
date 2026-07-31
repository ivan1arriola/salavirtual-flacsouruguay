export const ROLES_USUARIO = ["ADMINISTRACION", "ASISTENTE", "DOCENTE"] as const;

export type RolUsuario = (typeof ROLES_USUARIO)[number];

const MAPEO_ROLES_ANTERIORES: Readonly<Record<string, RolUsuario>> = Object.freeze({
  ADMINISTRADOR: "ADMINISTRACION",
  CONTADURIA: "ADMINISTRACION",
  SOPORTE_ZOOM: "ASISTENTE",
  ASISTENTE_ZOOM: "ASISTENTE",
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
