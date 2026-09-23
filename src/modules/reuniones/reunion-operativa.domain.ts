import { z } from "zod";

export type EstadoReunionOperativa =
  | "PROGRAMADA"
  | "ESPERANDO_INICIO"
  | "EN_CURSO"
  | "FINALIZADA"
  | "NO_INICIADA";

export type EstadoGrabacionOperativa =
  | "NO_REQUERIDA"
  | "PENDIENTE"
  | "PROCESANDO"
  | "DISPONIBLE"
  | "NO_REALIZADA";

export function derivarEstadoReunionOperativa(input: Readonly<{
  ahora: Date;
  inicio: Date;
  fin: Date;
  conferenciaInicio: Date | null;
  conferenciaFin: Date | null;
}>): EstadoReunionOperativa {
  if (input.conferenciaInicio && input.conferenciaFin) return "FINALIZADA";
  if (input.conferenciaInicio) return "EN_CURSO";
  if (input.ahora < input.inicio) return "PROGRAMADA";
  if (input.ahora <= input.fin) return "ESPERANDO_INICIO";
  return "NO_INICIADA";
}

export function derivarEstadoGrabacionOperativa(input: Readonly<{
  requiereGrabacion: boolean;
  estadoReunion: EstadoReunionOperativa;
  estadoProveedor: "AUSENTE" | "PROCESANDO" | "GENERADA" | null;
}>): EstadoGrabacionOperativa {
  if (!input.requiereGrabacion) return "NO_REQUERIDA";
  if (input.estadoProveedor === "GENERADA") return "DISPONIBLE";
  if (input.estadoProveedor === "PROCESANDO") return "PROCESANDO";
  if (input.estadoReunion === "FINALIZADA" || input.estadoReunion === "NO_INICIADA") {
    return "NO_REALIZADA";
  }
  return "PENDIENTE";
}

export function puedeConsultarReunionOperativa(input: Readonly<{
  rol: "ADMINISTRACION" | "DOCENTE" | "ASISTENTE_TECNICO";
  asistenteAsignado: boolean;
}>): boolean {
  return input.rol === "ADMINISTRACION"
    || (input.rol === "ASISTENTE_TECNICO" && input.asistenteAsignado);
}


export const incidenciaOperativaSchema = z.object({
  tipo: z.enum([
    "DOCENTE_NO_INGRESA",
    "AUDIO_VIDEO",
    "GRABACION",
    "SALA_INCORRECTA",
    "CONECTIVIDAD",
    "OTRA"
  ]),
  severidad: z.enum(["BAJA", "MEDIA", "ALTA", "CRITICA"]),
  descripcion: z.string().trim().min(3, "Describí brevemente la incidencia.").max(1000)
});

export type IncidenciaOperativaInput = z.infer<typeof incidenciaOperativaSchema>;
