import type { RolUsuario } from "../usuarios/roles";

export type AlcanceGrabaciones = "COMPLETO" | "PROGRAMAS_DOCENTE" | "ASIGNACIONES_ASISTENTE";

export function obtenerAlcanceGrabaciones(rol: RolUsuario): AlcanceGrabaciones {
  if (rol === "ADMINISTRACION") return "COMPLETO";
  if (rol === "DOCENTE") return "PROGRAMAS_DOCENTE";
  return "ASIGNACIONES_ASISTENTE";
}
