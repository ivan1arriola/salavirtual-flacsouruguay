import type { RolUsuario } from "../usuarios/roles";

export type AlcanceHistorico =
  | "COMPLETO"
  | "PROGRAMAS_DOCENTE"
  | "ASIGNACIONES_ASISTENTE";

export function obtenerAlcanceHistorico(rol: RolUsuario): AlcanceHistorico {
  if (rol === "ADMINISTRACION") return "COMPLETO";
  if (rol === "DOCENTE") return "PROGRAMAS_DOCENTE";
  return "ASIGNACIONES_ASISTENTE";
}

export function obtenerTituloHistorico(alcance: AlcanceHistorico): string {
  return alcance === "ASIGNACIONES_ASISTENTE" ? "Mi histórico" : "Histórico Zoom";
}
