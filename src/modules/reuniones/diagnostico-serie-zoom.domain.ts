import { evaluarEnlacesDeSerie, type EncuentroEnlaceSerie } from "./series-enlaces-distintos.domain";

export type ClasificacionSerieZoom = "SANA" | "MIGRABLE" | "MEZCLADA" | "ENLACES_DISTINTOS" | "RETOMABLE" | "HUERFANA" | "SIN_FUTUROS";
export type AccionSerieZoom = "MIGRAR" | "UNIFICAR_ENLACE" | "REANUDAR" | "VER_DETALLE";
export type ReunionZoomSerie = Readonly<{
  id: string;
  estadoCreacion: string;
  externalId: string | null;
  joinUrl: string | null;
  cuentaProveedorId: string | null;
}>;
export type AvisoSerie = Readonly<{ email: string; tipo: string; estado: string }>;
export type EntradaDiagnosticoSerie = Readonly<{
  serieClave: string;
  ahora: Date;
  encuentros: readonly EncuentroEnlaceSerie[];
  reuniones: readonly ReunionZoomSerie[];
  avisos: readonly AvisoSerie[];
}>;
export type DiagnosticoSerieZoom = Readonly<{
  serieClave: string;
  clasificacion: ClasificacionSerieZoom;
  conteos: Readonly<{
    total: number;
    enZoom: number;
    enMeet: number;
    reunionesZoomDistintas: number;
    enlacesDistintos: number;
  }>;
  avisos: Readonly<{ enviados: number; pendientes: number; conError: number; repetidos: number }>;
  acciones: readonly AccionSerieZoom[];
}>;

const accionesPorClasificacion: Readonly<Record<ClasificacionSerieZoom, readonly AccionSerieZoom[]>> = {
  SANA: ["VER_DETALLE"],
  MIGRABLE: ["MIGRAR"],
  MEZCLADA: ["MIGRAR", "VER_DETALLE"],
  ENLACES_DISTINTOS: ["UNIFICAR_ENLACE", "VER_DETALLE"],
  RETOMABLE: ["REANUDAR", "VER_DETALLE"],
  HUERFANA: ["VER_DETALLE"],
  SIN_FUTUROS: ["VER_DETALLE"],
};

/** Deriva el estado y las acciones de la serie sin modificar sus datos ni consultar proveedores. */
export function diagnosticarSerieZoom(entrada: EntradaDiagnosticoSerie): DiagnosticoSerieZoom {
  const { serieClave, ahora, encuentros, reuniones, avisos } = entrada;
  const futuros = encuentros.filter(({ estado, inicio }) => estado === "PROGRAMADA" && inicio > ahora);
  const activas = reuniones.filter(({ estadoCreacion }) => estadoCreacion !== "ELIMINADA");
  const zoom = futuros.filter(({ proveedor }) => proveedor === "ZOOM");
  const enMeet = futuros.length - zoom.length;
  const evaluacion = evaluarEnlacesDeSerie(futuros, ahora);

  const clasificacion: ClasificacionSerieZoom = (() => {
    if (futuros.length === 0) return activas.length > 0 ? "HUERFANA" : "SIN_FUTUROS";
    if (zoom.length > 0 && enMeet > 0) return "MEZCLADA";
    if (activas.some(({ estadoCreacion }) => estadoCreacion === "PENDIENTE" || estadoCreacion === "CREANDO")
      || (activas.length > 0 && enMeet === futuros.length)) return "RETOMABLE";
    if (zoom.length === futuros.length) return evaluacion.necesitaCorreccion ? "ENLACES_DISTINTOS" : "SANA";
    return "MIGRABLE";
  })();

  const eliminadas = new Set(reuniones.filter(({ estadoCreacion }) => estadoCreacion === "ELIMINADA").map(({ id }) => id));
  const reunionesDistintas = new Set([
    ...activas.map(({ id }) => id),
    ...zoom.map(({ reunionProveedorId }) => reunionProveedorId)
      .filter((id): id is string => id !== null && !eliminadas.has(id)),
  ]);
  const resumenAvisos = {
    enviados: avisos.filter(({ estado }) => estado === "ACEPTADO").length,
    pendientes: avisos.filter(({ estado }) => estado === "RESERVADO").length,
    conError: avisos.filter(({ estado }) => estado !== "ACEPTADO" && estado !== "RESERVADO").length,
    repetidos: avisos.length - new Set(avisos.map(({ email, tipo }) => JSON.stringify([email, tipo]))).size,
  };

  return {
    serieClave,
    clasificacion,
    conteos: {
      total: futuros.length,
      enZoom: zoom.length,
      enMeet,
      reunionesZoomDistintas: reunionesDistintas.size,
      enlacesDistintos: evaluacion.enlacesDistintos,
    },
    avisos: resumenAvisos,
    acciones: accionesPorClasificacion[clasificacion],
  };
}
