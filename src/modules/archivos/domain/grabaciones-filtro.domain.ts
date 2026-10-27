import type { TipoArtefactoMeet } from "./meet-artifacts.domain";

export type TipoFiltroArtefacto =
  | "TODOS"
  | "GRABACIONES"
  | "ASISTENCIAS"
  | "NOTAS_Y_TRANSCRIPCIONES";

export type EstadoVisualGrabacion =
  | "DISPONIBLE"
  | "EN_CURSO"
  | "PROCESANDO"
  | "NO_REGISTRADA"
  | "NO_REQUERIDA";

export type EstadoGrabacionDetectada = "AUSENTE" | "EN_CURSO" | "PROCESANDO" | "DISPONIBLE";
export const VIGENCIA_ESTADO_GRABACION_MS = 30 * 60 * 1000;

export type GrupoEncuentroConArchivos = Readonly<{
  instanciaId: string;
  titulo: string;
  programa: string;
  docente: string;
  fechaInicio: Date | string;
  folderId?: string | null;
  requiereGrabacion?: boolean;
  estadoGrabacion?: EstadoVisualGrabacion;
  archivos: readonly Readonly<{
    id: string;
    tipo: TipoArtefactoMeet;
    nombre?: string;
    webViewUrl?: string | null;
    tamanoBytes?: bigint | number | null;
    mimeType?: string | null;
  }>[];
}>;

export function resolverEstadoVisualGrabacion(datos: {
  tieneArchivoGrabacion: boolean;
  archivosSincronizadosAt: Date | null;
  finProgramadoAt: Date;
  requiereGrabacion: boolean;
  ahora: Date;
  estadoDetectado?: EstadoGrabacionDetectada | null;
  observadoAt?: Date | null;
}): EstadoVisualGrabacion {
  if (datos.tieneArchivoGrabacion) return "DISPONIBLE";
  if (datos.observadoAt &&
      datos.ahora.getTime() - datos.observadoAt.getTime() >= 0 &&
      datos.ahora.getTime() - datos.observadoAt.getTime() < VIGENCIA_ESTADO_GRABACION_MS) {
    if (datos.estadoDetectado === "EN_CURSO") return "EN_CURSO";
    if (datos.estadoDetectado === "PROCESANDO") return "PROCESANDO";
  }
  if (!datos.requiereGrabacion) return "NO_REQUERIDA";
  return "NO_REGISTRADA";
}

export function filtrarEncuentrosConArchivos(
  grupos: readonly GrupoEncuentroConArchivos[],
  filtro: TipoFiltroArtefacto,
  busqueda: string
): readonly GrupoEncuentroConArchivos[] {
  const query = busqueda.trim().toLowerCase();

  return grupos.filter((grupo) => {
    if (filtro === "GRABACIONES" &&
        !grupo.archivos.some((a) => a.tipo === "GRABACION") &&
        grupo.estadoGrabacion !== "EN_CURSO" && grupo.estadoGrabacion !== "PROCESANDO") {
      return false;
    }
    if (filtro === "ASISTENCIAS" && !grupo.archivos.some((a) => a.tipo === "LISTA_ASISTENCIA")) {
      return false;
    }
    if (
      filtro === "NOTAS_Y_TRANSCRIPCIONES" &&
      !grupo.archivos.some((a) => a.tipo === "TRANSCRIPCION" || a.tipo === "NOTAS")
    ) {
      return false;
    }

    if (!query) return true;
    const matchTitulo = grupo.titulo.toLowerCase().includes(query);
    const matchPrograma = grupo.programa.toLowerCase().includes(query);
    const matchDocente = grupo.docente.toLowerCase().includes(query);

    return matchTitulo || matchPrograma || matchDocente;
  });
}

