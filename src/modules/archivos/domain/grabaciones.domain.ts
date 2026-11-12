import type { RolUsuario } from "./archivos.types";

export type AlcanceGrabaciones = "COMPLETO" | "PROGRAMAS_DOCENTE" | "ASIGNACIONES_ASISTENTE";

export function obtenerAlcanceGrabaciones(rol: RolUsuario): AlcanceGrabaciones {
  if (rol === "ADMINISTRACION") {
    return "COMPLETO";
  }
  if (rol === "DOCENTE") {
    return "PROGRAMAS_DOCENTE";
  }
  return "ASIGNACIONES_ASISTENTE";
}

export function puedeSincronizarGrabaciones(rol: RolUsuario): boolean {
  return rol === "ADMINISTRACION" || rol === "DOCENTE";
}
