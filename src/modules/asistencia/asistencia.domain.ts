import { z } from "zod";
import type { RolUsuario } from "../usuarios/roles";

export const postulacionAsistenciaSchema = z.object({
  instanciaSalaId: z.string().trim().min(1),
  accion: z.enum(["POSTULAR", "RETIRAR"]),
  comentario: z.string().trim().max(500).optional()
});

export const asignacionAsistenciaSchema = z.object({
  instanciaSalaId: z.string().trim().min(1),
  asistenteId: z.string().trim().min(1)
});

export const reporteDuracionSchema = z.object({
  asignacionId: z.string().trim().min(1),
  minutos: z.number().int().min(1).max(24 * 60),
  comentario: z.string().trim().max(1000).optional()
});

export function puedeGestionarPostulacion(rol: RolUsuario): boolean {
  return rol === "ASISTENTE";
}

export function puedeAsignarAsistencia(rol: RolUsuario): boolean {
  return rol === "ADMINISTRACION";
}

export function estadoInteresParaAccion(
  accion: "POSTULAR" | "RETIRAR"
): "ME_INTERESA" | "RETIRADO" {
  return accion === "POSTULAR" ? "ME_INTERESA" : "RETIRADO";
}
