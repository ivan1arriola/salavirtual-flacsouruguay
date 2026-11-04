import { asistenciaLocalAIso } from "@/src/modules/reuniones/horarios-asistencia.adapter";
import { sugerirHorarioAsistencia } from "@/src/modules/reuniones/horarios-asistencia.domain";
import type { MeetingDate } from "./tipos";

export type EntradaSolicitud = Readonly<{
  titulo: string;
  descripcion?: string;
  docenteProgramaId: string;
  asistenteTecnicoId?: string;
  requiereAsistencia: boolean;
  requiereGrabacion: boolean;
  modalidad: "VIRTUAL" | "HIBRIDA";
  fechas: readonly MeetingDate[];
}>;

export type SolicitudReunion = ReturnType<typeof construirSolicitudReunion>;

export function construirSolicitudReunion({ titulo, descripcion, docenteProgramaId, asistenteTecnicoId, requiereAsistencia, requiereGrabacion, modalidad, fechas }: EntradaSolicitud) {
  return {
    titulo,
    descripcion: descripcion || undefined,
    docenteProgramaId,
    plataforma: "ZOOM",
    asistenteTecnicoId,
    requiereAsistenciaTecnica: requiereAsistencia,
    requiereGrabacion: requiereGrabacion,
    modalidad: requiereAsistencia ? modalidad : "VIRTUAL",
    timezone: "America/Montevideo",
    instancias: fechas.map(({
      fecha,
      horaInicio,
      horaFin,
      horaAsistenciaInicio,
      horaAsistenciaFin,
      descripcion
    }) => ({
      inicio: localMontevideoToIso(fecha, horaInicio),
      fin: localMontevideoToIso(fecha, horaFin),
      asistenciaInicio: requiereAsistencia
        ? asistenciaLocalAIso(fecha, horaInicio, modalidad === "VIRTUAL" ? sugerirHorarioAsistencia(horaInicio, horaFin, "VIRTUAL").llegada : horaAsistenciaInicio, "LLEGADA")
        : undefined,
      asistenciaFin: requiereAsistencia
        ? asistenciaLocalAIso(fecha, horaFin, modalidad === "VIRTUAL" ? horaFin : horaAsistenciaFin, "SALIDA")
        : undefined,
      descripcion: descripcion || undefined
    }))
  };
}

export function localMontevideoToIso(fecha: string, hora: string): string {
  return new Date(`${fecha}T${hora}:00-03:00`).toISOString();
}

/** Solo Administración asigna asistente, y solo si se pidió monitoreo en modo «Asignar ahora». */
export function resolverAsistenteTecnicoId(entrada: Readonly<{
  puedeAsignar: boolean;
  requiereAsistencia: boolean;
  modoAsistencia: "OPEN" | "ASSIGN";
  valorSeleccionado: string | null | undefined;
}>): string | undefined {
  return entrada.puedeAsignar && entrada.requiereAsistencia && entrada.modoAsistencia === "ASSIGN"
    ? entrada.valorSeleccionado || undefined
    : undefined;
}
