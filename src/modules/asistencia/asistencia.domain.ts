import { z } from "zod";
import type { RolUsuario } from "../usuarios/roles";

export const postulacionAsistenciaSchema = z.object({
  instanciaSalaId: z.string().trim().min(1),
  accion: z.enum(["POSTULAR", "RETIRAR"]),
  comentario: z.string().trim().max(500).optional()
});

export const asignacionAsistenciaSchema = z.object({
  instanciaSalaId: z.string().trim().min(1),
  asistenteTecnicoId: z.string().trim().min(1)
});

export const desvinculacionAsistenciaSchema = z.object({
  asignacionId: z.string().trim().min(1)
});

export const notificacionAsistenciaSchema = z.object({
  instanciaSalaId: z.string().trim().min(1)
});

const horaSchema = z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/);

export const disponibilidadSemanalSchema = z.object({
  disponibleGeneral: z.boolean(),
  franjas: z.array(z.object({
    diaSemana: z.number().int().min(0).max(6),
    horaDesde: horaSchema,
    horaHasta: horaSchema,
    tipo: z.enum(["DISPONIBLE", "NO_DISPONIBLE", "PREFERENTE"])
  }).refine(({ horaDesde, horaHasta }) => horaDesde < horaHasta, {
    message: "La hora de fin debe ser posterior a la hora de inicio."
  })).max(7)
});

export const reporteDuracionSchema = z.object({
  asignacionId: z.string().trim().min(1),
  inicioReal: z.coerce.date(),
  finReal: z.coerce.date(),
  comentario: z.string().trim().max(1000).optional(),
  incidencia: z.object({
    tipo: z.string().trim().min(2).max(80),
    severidad: z.enum(["BAJA", "MEDIA", "ALTA", "CRITICA"]),
    descripcion: z.string().trim().min(3).max(1000)
  }).optional()
}).superRefine((input, context) => {
  const minutos = Math.round((input.finReal.getTime() - input.inicioReal.getTime()) / 60_000);
  if (minutos < 1 || minutos > 24 * 60) {
    context.addIssue({
      code: "custom",
      path: ["finReal"],
      message: "La hora de fin debe ser posterior al inicio y la duración no puede superar 24 horas."
    });
  }
});

export function puedeGestionarPostulacion(rol: RolUsuario): boolean {
  return rol === "ASISTENTE_TECNICO";
}

export function puedeAsignarAsistencia(rol: RolUsuario): boolean {
  return rol === "ADMINISTRACION";
}

export const SEPARACION_MINIMA_ASISTENCIAS_MINUTOS = 30;

export type PeriodoAsistencia = Readonly<{
  inicio: Date;
  fin: Date;
}>;

export function cumpleSeparacionMinimaAsistencias(
  izquierda: PeriodoAsistencia,
  derecha: PeriodoAsistencia
): boolean {
  const separacionMs = SEPARACION_MINIMA_ASISTENCIAS_MINUTOS * 60_000;
  return izquierda.fin.getTime() + separacionMs <= derecha.inicio.getTime()
    || derecha.fin.getTime() + separacionMs <= izquierda.inicio.getTime();
}

export function estadoInteresParaAccion(
  accion: "POSTULAR" | "RETIRAR"
): "ME_INTERESA" | "RETIRADO" {
  return accion === "POSTULAR" ? "ME_INTERESA" : "RETIRADO";
}
