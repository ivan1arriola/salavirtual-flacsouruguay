import type { AutenticacionZoom } from "../../../../integrations/zoom/zoom-http";
import { listarParticipantesReunionPasadaZoomHttp } from "../../../../integrations/zoom/zoom-reports.client";
import { claveSesionZoom, type HashZoom, type SesionObservadaZoom } from "../../domain";

export type ResultadoSesionesZoom =
  /** 404: Zoom todavía no tiene el reporte. No equivale a "nadie asistió". */
  | Readonly<{ estado: "NO_DISPONIBLE" }>
  /** El reporte existe y no tiene participantes. */
  | Readonly<{ estado: "VACIO" }>
  | Readonly<{ estado: "DISPONIBLE"; sesiones: readonly SesionObservadaZoom[] }>;

export type ZoomAsistenciaProviderDeps = Readonly<{ auth: AutenticacionZoom; hash: HashZoom }>;

export type ZoomAsistenciaProvider = Readonly<{
  /** Un error de Zoom (403, red, paginación incompleta) se propaga: nunca se interpreta como vacío. */
  obtenerSesiones(uuidOcurrencia: string): Promise<ResultadoSesionesZoom>;
}>;

export function crearZoomAsistenciaProviderAdapter(deps: ZoomAsistenciaProviderDeps): ZoomAsistenciaProvider {
  return {
    async obtenerSesiones(uuid) {
      const token = typeof deps.auth === "string" ? deps.auth : await deps.auth.obtener();
      const filas = await listarParticipantesReunionPasadaZoomHttp(token, uuid);
      if (filas === null) return { estado: "NO_DISPONIBLE" };
      if (filas.length === 0) return { estado: "VACIO" };
      const sesiones = filas.map((fila): SesionObservadaZoom => ({
        claveSesion: claveSesionZoom(deps.hash, uuid, {
          participanteId: fila.participantId, userId: fila.userId, nombre: fila.nombre,
          entradaAt: fila.joinTime, salidaAt: fila.leaveTime
        }),
        participanteId: fila.participantId,
        userId: fila.userId,
        nombre: fila.nombre,
        email: fila.email,
        entradaAt: fila.joinTime,
        salidaAt: fila.leaveTime,
        status: fila.status,
        // El reporte de participantes no comprueba roles: host/cohost se asigna por otra vía verificada.
        rol: null
      }));
      return { estado: "DISPONIBLE", sesiones };
    }
  };
}
