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
  | "GRABANDO"
  | "PROCESANDO"
  | "DISPONIBLE"
  | "NO_REALIZADA";

export type EstadoTranscripcionOperativa =
  | "NO_TRANSCRIBIENDO"
  | "TRANSCRIBIENDO"
  | "PROCESANDO"
  | "DISPONIBLE";

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
  grabandoEnVivo?: boolean;
}>): EstadoGrabacionOperativa {
  if (input.grabandoEnVivo) return "GRABANDO";
  if (!input.requiereGrabacion) return "NO_REQUERIDA";
  if (input.estadoProveedor === "GENERADA") return "DISPONIBLE";
  if (input.estadoProveedor === "PROCESANDO") return "PROCESANDO";
  if (input.estadoReunion === "FINALIZADA" || input.estadoReunion === "NO_INICIADA") {
    return "NO_REALIZADA";
  }
  return "PENDIENTE";
}

export function derivarEstadoTranscripcionOperativa(input: Readonly<{
  transcribiendoEnVivo?: boolean;
  estadoProveedor?: "AUSENTE" | "TRANSCRIBIENDO" | "PROCESANDO" | "GENERADA" | null;
}>): EstadoTranscripcionOperativa {
  if (input.transcribiendoEnVivo || input.estadoProveedor === "TRANSCRIBIENDO") {
    return "TRANSCRIBIENDO";
  }
  if (input.estadoProveedor === "GENERADA") return "DISPONIBLE";
  if (input.estadoProveedor === "PROCESANDO") return "PROCESANDO";
  return "NO_TRANSCRIBIENDO";
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

export const controlOperativoReunionSchema = z.object({
  tipoAccesoMeet: z.enum(["OPEN", "TRUSTED", "RESTRICTED"]).optional(),
  requiereGrabacion: z.boolean().optional(),
  modalidad: z.enum(["HIBRIDA", "VIRTUAL"]).optional(),
  inicioAsistenciaTecnicaAt: z.string().trim().min(1).optional(),
  finAsistenciaTecnicaAt: z.string().trim().min(1).optional(),
  agregarCohostEmail: z.string().trim().email("Ingresá un correo de cohost válido.").optional(),
  quitarCohostEmail: z.string().trim().email("Ingresá un correo de cohost válido.").optional()
});

export type ControlOperativoReunionInput = z.infer<typeof controlOperativoReunionSchema>;

export const registroAsistenciaOperativoSchema = z.object({
  claveParticipante: z.string().trim().min(1).max(200),
  nombre: z.string().trim().min(1, "El nombre del asistente es obligatorio.").max(200),
  email: z.string().trim().email("Ingresá un correo válido.").nullable().optional().or(z.literal("")),
  rolEnReunion: z.enum(["HOST", "COHOST", "DOCENTE", "ASISTENTE_TECNICO", "PARTICIPANTE"]).optional(),
  tipoAcceso: z.enum(["CUENTA_GOOGLE", "ANONIMO", "TELEFONO"]).optional(),
  conectado: z.boolean().optional(),
  enGrupoPequeno: z.boolean().optional(),
  salaGrupoPequeno: z.string().trim().max(160).nullable().optional(),
  notasOperador: z.string().trim().max(500).nullable().optional()
});

export type RegistroAsistenciaOperativoInput = z.infer<typeof registroAsistenciaOperativoSchema>;

