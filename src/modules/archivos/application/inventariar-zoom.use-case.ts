import {
  DIAS_VENTANA_LISTADO_GRABACIONES,
  particionarPeriodoZoom,
  type ReferenciaOcurrenciaZoom,
  type ResultadoInventarioZoom,
  type ResultadoPagina,
  type VentanaZoom
} from "../domain";
import type { ResumenInventarioGuardado, ZoomArchivoRepositoryPort } from "../ports";

const MIN = 60_000;
const HORA = 60 * MIN;
const DIA = 24 * HORA;
const ZONA_NEGOCIO = "America/Montevideo";

export type AnfitrionInventarioZoom = Readonly<{
  cuentaZoomId: string;
  anfitrionZoomId: string;
  /** Sala local; las inactivas también se barren: salir del grupo no oculta el histórico. */
  cuentaProveedorId: string | null;
}>;

/** Lectura del inventario en Zoom. `null` es un 404, distinto de un inventario vacío. */
export interface InventarioOrigenZoomPort {
  obtenerInventario(ocurrencia: ReferenciaOcurrenciaZoom): Promise<ResultadoInventarioZoom | null>;
  listarOcurrencias(
    anfitrion: AnfitrionInventarioZoom,
    ventana: VentanaZoom,
    cursor: string | null
  ): Promise<ResultadoPagina<ReferenciaOcurrenciaZoom>>;
}

/** Cadencia: <48 h cada 10 min, hasta 30 días cada hora, más antiguas a diario; `null` tras el corte. */
export function proximoInventarioZoom(
  inicioRealAt: Date,
  ahora: Date,
  opciones: Readonly<{ procesamientoPendiente: boolean; corteDias: number }>
): Date | null {
  const edad = ahora.getTime() - inicioRealAt.getTime();
  const intervalo = edad < 48 * HORA ? 10 * MIN : edad <= 30 * DIA ? HORA : DIA;
  if (opciones.procesamientoPendiente) {
    // Hay elementos aún procesándose en Zoom: seguimiento frecuente hasta 30 días, luego a diario.
    return new Date(ahora.getTime() + (edad <= 30 * DIA ? 10 * MIN : DIA));
  }
  if (edad > opciones.corteDias * DIA) {
    return null;
  }
  return new Date(ahora.getTime() + intervalo);
}

export type ResultadoInventariarZoom =
  Readonly<{ tipo: "GUARDADO"; resumen: ResumenInventarioGuardado }> | Readonly<{ tipo: "NO_ENCONTRADA" }>;

export async function inventariarZoomUseCase(
  repo: Pick<ZoomArchivoRepositoryPort, "guardarInventario">,
  origen: Pick<InventarioOrigenZoomPort, "obtenerInventario">,
  entrada: Readonly<{
    referencia: ReferenciaOcurrenciaZoom;
    cuentaProveedorId: string | null;
    ahora: Date;
    corteDias: number;
  }>
): Promise<ResultadoInventariarZoom> {
  const inventario = await origen.obtenerInventario(entrada.referencia);
  // 404 nunca equivale a "sin archivos": no se registra un inventario vacío exitoso.
  if (inventario === null) {
    return { tipo: "NO_ENCONTRADA" };
  }
  const resumen = await repo.guardarInventario(
    {
      referencia: entrada.referencia,
      cuentaProveedorId: entrada.cuentaProveedorId,
      inventariadoAt: entrada.ahora,
      proximoInventarioAt: proximoInventarioZoom(entrada.referencia.inicioRealAt, entrada.ahora, {
        procesamientoPendiente: inventario.procesamientoPendiente,
        corteDias: entrada.corteDias
      })
    },
    inventario
  );
  return { tipo: "GUARDADO", resumen };
}

export type ResumenMantenimientoInventarioZoom = Readonly<{
  guardadas: number;
  fallidas: number;
  noEncontradas: number;
}>;

export async function inventariarOcurrenciasVencidasZoomUseCase(
  repo: Pick<ZoomArchivoRepositoryPort, "guardarInventario" | "listarOcurrenciasPorInventariar">,
  origen: Pick<InventarioOrigenZoomPort, "obtenerInventario">,
  entrada: Readonly<{ ahora: Date; limite: number; corteDias: number }>
): Promise<ResumenMantenimientoInventarioZoom> {
  const vencidas = await repo.listarOcurrenciasPorInventariar(entrada.ahora, entrada.limite);
  let guardadas = 0;
  let fallidas = 0;
  let noEncontradas = 0;
  for (const v of vencidas) {
    try {
      const r = await inventariarZoomUseCase(repo, origen, {
        ...v,
        ahora: entrada.ahora,
        corteDias: entrada.corteDias
      });
      if (r.tipo === "GUARDADO") {
        guardadas++;
      } else {
        noEncontradas++;
      }
    } catch {
      // Una ocurrencia con error no frena a las demás; queda vencida y se reintenta en el próximo ciclo.
      fallidas++;
    }
  }
  return { guardadas, fallidas, noEncontradas };
}

function fechaMontevideo(fecha: Date): string {
  // en-CA formatea como YYYY-MM-DD.
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: ZONA_NEGOCIO,
    year: "numeric",
    month: "2-digit",
    day: "2-digit"
  }).format(fecha);
}

export type ErrorBarridoZoom = Readonly<{ anfitrionZoomId: string; codigo: string }>;
export type ResumenBarridoZoom = Readonly<{
  ocurrencias: number;
  /** De `ocurrencias`, las halladas en la papelera de Zoom. */
  ocurrenciasPapelera: number;
  anfitrionesConError: number;
  ocurrenciasConError: number;
  /** Código del error por anfitrión (nunca el mensaje: puede traer URLs); acotado a 25. */
  errores: readonly ErrorBarridoZoom[];
}>;

/** Código diagnosticable sin datos sensibles: `CODIGO:estado[:zNNN]` para errores de Zoom (NNN = código numérico de Zoom), o el nombre de la clase. */
export function codigoDeError(error: unknown): string {
  const e = error as { name?: unknown; code?: unknown; status?: unknown; codigoZoom?: unknown } | null;
  if (e?.name === "ZoomApiError" && typeof e.code === "string") {
    const base = typeof e.status === "number" ? `${e.code}:${e.status}` : e.code;
    return typeof e.codigoZoom === "number" ? `${base}:z${e.codigoZoom}` : base;
  }
  return typeof e?.name === "string" ? e.name : "ERROR_DESCONOCIDO";
}

/**
 * Barre los últimos `diasAtras` días de cada anfitrión (activo o no) en ventanas de a lo sumo 28
 * días e inventaría cada ocurrencia hallada. Un anfitrión o una ocurrencia con error no frena a los
 * demás, y el error se cuenta: el barrido no se declara completo.
 */
export async function barrerAnfitrionesZoomUseCase(
  repo: Pick<ZoomArchivoRepositoryPort, "guardarInventario">,
  origen: InventarioOrigenZoomPort,
  entrada: Readonly<{
    anfitriones: readonly AnfitrionInventarioZoom[];
    ahora: Date;
    diasAtras: number;
    corteDias: number;
  }>
): Promise<ResumenBarridoZoom> {
  const hasta = fechaMontevideo(entrada.ahora);
  const desde = fechaMontevideo(new Date(entrada.ahora.getTime() - entrada.diasAtras * DIA));
  const ventanas = particionarPeriodoZoom(desde, hasta, DIAS_VENTANA_LISTADO_GRABACIONES);
  let ocurrencias = 0;
  let ocurrenciasPapelera = 0;
  let anfitrionesConError = 0;
  let ocurrenciasConError = 0;
  const errores: ErrorBarridoZoom[] = [];

  for (const anfitrion of entrada.anfitriones) {
    try {
      for (const ventana of ventanas) {
        // Activas y papelera de cada ventana: una grabación eliminada poco después de terminar la reunión se conserva igual.
        for (const papelera of [false, true]) {
          let cursor: string | null = null;
          const vistos = new Set<string>();
          do {
            const pagina: ResultadoPagina<ReferenciaOcurrenciaZoom> = await origen.listarOcurrencias(
              anfitrion,
              papelera ? { ...ventana, papelera: true } : ventana,
              cursor
            );
            for (const referencia of pagina.elementos) {
              ocurrencias++;
              if (papelera) {
                ocurrenciasPapelera++;
              }
              try {
                await inventariarZoomUseCase(repo, origen, {
                  referencia,
                  cuentaProveedorId: anfitrion.cuentaProveedorId,
                  ahora: entrada.ahora,
                  corteDias: entrada.corteDias
                });
              } catch {
                ocurrenciasConError++;
              }
            }
            cursor = pagina.siguiente;
            if (cursor !== null) {
              // Un cursor repetido no avanza: se corta sin declarar completa la ventana.
              if (vistos.has(cursor)) {
                throw new Error("Cursor de paginación repetido.");
              }
              vistos.add(cursor);
            }
          } while (cursor !== null);
        }
      }
    } catch (error) {
      anfitrionesConError++;
      if (errores.length < 25) {
        errores.push({ anfitrionZoomId: anfitrion.anfitrionZoomId, codigo: codigoDeError(error) });
      }
    }
  }
  return { ocurrencias, ocurrenciasPapelera, anfitrionesConError, ocurrenciasConError, errores };
}
