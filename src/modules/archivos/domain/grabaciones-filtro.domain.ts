import type { TipoArtefactoMeet } from "./meet-artifacts.domain";

export type TipoFiltroArtefacto =
  | "TODOS"
  | "GRABACIONES"
  | "ASISTENCIAS"
  | "NOTAS_Y_TRANSCRIPCIONES";

export type EstadoVisualGrabacion =
  | "DISPONIBLE"
  | "PROCESANDO"
  | "NO_REGISTRADA"
  | "NO_REQUERIDA";

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
}): EstadoVisualGrabacion {
  if (datos.tieneArchivoGrabacion) return "DISPONIBLE";
  const transcurridoMs = datos.ahora.getTime() - datos.finProgramadoAt.getTime();
  const cuatroHorasMs = 4 * 60 * 60 * 1000;

  if (datos.archivosSincronizadosAt === null && transcurridoMs < cuatroHorasMs) {
    return "PROCESANDO";
  }

  if (datos.requiereGrabacion) {
    return "NO_REGISTRADA";
  }

  return "NO_REQUERIDA";
}

export function filtrarEncuentrosConArchivos(
  grupos: readonly GrupoEncuentroConArchivos[],
  filtro: TipoFiltroArtefacto,
  busqueda: string
): readonly GrupoEncuentroConArchivos[] {
  const query = busqueda.trim().toLowerCase();

  return grupos.filter((grupo) => {
    if (filtro === "GRABACIONES" && !grupo.archivos.some((a) => a.tipo === "GRABACION")) {
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

