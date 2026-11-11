import {
  DIAS_VENTANA_LISTADO_GRABACIONES,
  particionarPeriodoZoom,
  proximoIntentoZoom,
  type ReferenciaOcurrenciaZoom,
  type ResultadoPagina,
  type VentanaZoom
} from "../domain";
import type {
  BarridoZoom,
  BarridoZoomRepositoryPort,
  LeaseBarridoZoom,
  PosicionBarridoZoom,
  ZoomArchivoRepositoryPort
} from "../ports";
import {
  codigoDeError,
  inventariarZoomUseCase,
  type AnfitrionInventarioZoom,
  type ErrorBarridoZoom,
  type InventarioOrigenZoomPort
} from "./inventariar-zoom.use-case";

const MAX_PAGINAS_DRY_RUN = 500;
const FECHA = /^\d{4}-\d{2}-\d{2}$/;

/** `id` null: ejecución desde el script del servidor, sin usuario de la aplicación. */
export type ActorRecuperacionZoom = Readonly<{ id: string | null; rol: "ADMINISTRACION" | "DOCENTE" | "ASISTENTE_TECNICO" }>;

export type SolicitudRecuperacionZoom = Readonly<{
  /** Vacío = todos los anfitriones configurados. Un id desconocido se rechaza: nunca se consulta fuera de la lista. */
  anfitrionIds: readonly string[];
  /** Fechas inclusivas YYYY-MM-DD: el periodo se pide explícito, sin heredar siete días. */
  desde: string;
  hasta: string;
  dryRun: boolean;
}>;

export type ResumenRecuperacion =
  | Readonly<{ tipo: "PROHIBIDO" }>
  | Readonly<{ tipo: "PETICION_INVALIDA"; motivo: string }>
  | Readonly<{
      tipo: "DRY_RUN";
      desde: string;
      hasta: string;
      anfitriones: number;
      ventanas: number;
      ocurrencias: number;
      /** Límites reales de lo hallado; null si no se halló nada. Zoom puede conservar menos que el periodo pedido. */
      primeraOcurrenciaAt: Date | null;
      ultimaOcurrenciaAt: Date | null;
      errores: readonly ErrorBarridoZoom[];
    }>
  | Readonly<{ tipo: "ENCOLADA"; barridoId: string; desde: string; hasta: string; anfitriones: number; ventanas: number }>;

export type DepsCrearRecuperacionZoom = Readonly<{
  origen: Pick<InventarioOrigenZoomPort, "listarOcurrencias">;
  repoBarridos: Pick<BarridoZoomRepositoryPort, "crear">;
  cuentaZoomId: string;
  ahora: () => Date;
  /** Anfitriones configurados, activos o no. */
  anfitriones: () => Promise<readonly AnfitrionInventarioZoom[]>;
}>;

function fechaValida(valor: string): boolean {
  return FECHA.test(valor) && new Date(`${valor}T00:00:00Z`).toISOString().slice(0, 10) === valor;
}

function hoyUtc(ahora: Date): string {
  return ahora.toISOString().slice(0, 10);
}

/**
 * Crea una recuperación histórica. `dryRun` solo lee de Zoom (no escribe ni encola transferencias) y
 * resume cantidad y fechas reales para que la administración lo revise antes de aplicar.
 */
export async function crearRecuperacionZoom(
  deps: DepsCrearRecuperacionZoom,
  actor: ActorRecuperacionZoom,
  solicitud: SolicitudRecuperacionZoom
): Promise<ResumenRecuperacion> {
  if (actor.rol !== "ADMINISTRACION") return { tipo: "PROHIBIDO" };
  if (!fechaValida(solicitud.desde) || !fechaValida(solicitud.hasta)) {
    return { tipo: "PETICION_INVALIDA", motivo: "FECHA_INVALIDA" };
  }
  if (solicitud.desde > solicitud.hasta) return { tipo: "PETICION_INVALIDA", motivo: "PERIODO_INVERTIDO" };
  // El día siguiente cubre la diferencia horaria con Montevideo; más allá es futuro.
  if (solicitud.hasta > hoyUtc(new Date(deps.ahora().getTime() + 86_400_000))) {
    return { tipo: "PETICION_INVALIDA", motivo: "PERIODO_FUTURO" };
  }

  const configurados = await deps.anfitriones();
  const elegidos = solicitud.anfitrionIds.length === 0
    ? configurados
    : solicitud.anfitrionIds.map((id) => configurados.find((a) => a.anfitrionZoomId === id) ?? null);
  if (elegidos.length === 0 || elegidos.some((a) => a === null)) {
    return { tipo: "PETICION_INVALIDA", motivo: "ANFITRION_NO_CONFIGURADO" };
  }
  const anfitriones = [...new Map((elegidos as AnfitrionInventarioZoom[]).map((a) => [a.anfitrionZoomId, a])).values()];
  const ventanas = particionarPeriodoZoom(solicitud.desde, solicitud.hasta, DIAS_VENTANA_LISTADO_GRABACIONES);

  if (!solicitud.dryRun) {
    const { id } = await deps.repoBarridos.crear({
      cuentaZoomId: deps.cuentaZoomId,
      anfitriones: anfitriones.map((a) => ({ anfitrionZoomId: a.anfitrionZoomId, cuentaProveedorId: a.cuentaProveedorId })),
      desde: solicitud.desde,
      hasta: solicitud.hasta,
      solicitanteId: actor.id
    });
    return {
      tipo: "ENCOLADA", barridoId: id, desde: solicitud.desde, hasta: solicitud.hasta,
      anfitriones: anfitriones.length, ventanas: ventanas.length
    };
  }

  let ocurrencias = 0;
  let primera: Date | null = null;
  let ultima: Date | null = null;
  const errores: ErrorBarridoZoom[] = [];
  for (const anfitrion of anfitriones) {
    try {
      for (const ventana of ventanas) {
        let cursor: string | null = null;
        let paginas = 0;
        do {
          const pagina: ResultadoPagina<ReferenciaOcurrenciaZoom> = await deps.origen.listarOcurrencias(anfitrion, ventana, cursor);
          for (const o of pagina.elementos) {
            ocurrencias++;
            if (primera === null || o.inicioRealAt < primera) primera = o.inicioRealAt;
            if (ultima === null || o.inicioRealAt > ultima) ultima = o.inicioRealAt;
          }
          if (pagina.siguiente !== null && (pagina.siguiente === cursor || ++paginas >= MAX_PAGINAS_DRY_RUN)) {
            throw new Error("Paginación sin fin.");
          }
          cursor = pagina.siguiente;
        } while (cursor !== null);
      }
    } catch (error) {
      if (errores.length < 25) errores.push({ anfitrionZoomId: anfitrion.anfitrionZoomId, codigo: codigoDeError(error) });
    }
  }
  return {
    tipo: "DRY_RUN", desde: solicitud.desde, hasta: solicitud.hasta, anfitriones: anfitriones.length,
    ventanas: ventanas.length, ocurrencias, primeraOcurrenciaAt: primera, ultimaOcurrenciaAt: ultima, errores
  };
}

export type ProgresoBarrido =
  | Readonly<{ tipo: "AVANZO"; ocurrencias: number }>
  | Readonly<{ tipo: "COMPLETADO"; ocurrencias: number }>
  | Readonly<{ tipo: "ERROR_REINTENTABLE"; codigo: string }>
  | Readonly<{ tipo: "REQUIERE_REVISION"; codigo: string }>
  /** No existe, ya terminó, requiere revisión o espera su próximo intento. */
  | Readonly<{ tipo: "NO_DISPONIBLE" }>
  | Readonly<{ tipo: "LEASE_OBSOLETO" }>;

export type DepsProcesarPaginaRecuperacionZoom = Readonly<{
  repoBarridos: BarridoZoomRepositoryPort;
  repoArchivos: Pick<ZoomArchivoRepositoryPort, "guardarInventario">;
  origen: InventarioOrigenZoomPort;
  cuentaZoomId: string;
  ahora: () => Date;
  leaseMs: number;
  corteDias: number;
  aleatorio: () => number;
  /** Fallos consecutivos tras los cuales el barrido exige revisión. */
  limiteIntentos: number;
}>;

type ErrorZoomLeido = { code?: unknown; status?: unknown; codigoZoom?: unknown; reintentarEnSegundos?: unknown };

function leerErrorZoom(error: unknown): ErrorZoomLeido {
  return error !== null && typeof error === "object" ? (error as ErrorZoomLeido) : {};
}

/** Posición que sigue a una página con `siguiente` (o a un anfitrión omitido); null si ya no queda nada. */
function posicionSiguiente(
  barrido: BarridoZoom,
  ventanas: readonly VentanaZoom[],
  indiceVentana: number,
  siguiente: string | null,
  omitirAnfitrion: boolean
): PosicionBarridoZoom | null {
  const { anfitrionIndice } = barrido.posicion;
  if (!omitirAnfitrion && siguiente !== null) {
    return { anfitrionIndice, ventanaDesde: ventanas[indiceVentana]!.desde, cursor: siguiente };
  }
  if (!omitirAnfitrion && indiceVentana + 1 < ventanas.length) {
    return { anfitrionIndice, ventanaDesde: ventanas[indiceVentana + 1]!.desde, cursor: null };
  }
  if (anfitrionIndice + 1 < barrido.anfitriones.length) {
    return { anfitrionIndice: anfitrionIndice + 1, ventanaDesde: null, cursor: null };
  }
  return null;
}

async function fallar(
  deps: DepsProcesarPaginaRecuperacionZoom,
  lease: LeaseBarridoZoom,
  barrido: BarridoZoom,
  codigo: string,
  opciones: Readonly<{ revision?: boolean; reiniciarCursor?: boolean; reintentarEnSegundos?: number | null }> = {}
): Promise<ProgresoBarrido> {
  const ahora = deps.ahora();
  const registrado = await deps.repoBarridos.registrarFallo(lease, {
    tipo: opciones.revision ? "REVISION" : "REINTENTABLE",
    codigo,
    proximoIntentoAt: opciones.revision
      ? null
      : proximoIntentoZoom(barrido.intentos + 1, ahora, deps.aleatorio, opciones.reintentarEnSegundos ?? null),
    reiniciarCursor: opciones.reiniciarCursor,
    limiteIntentos: deps.limiteIntentos
  });
  if (!registrado) return { tipo: "LEASE_OBSOLETO" };
  return opciones.revision ? { tipo: "REQUIERE_REVISION", codigo } : { tipo: "ERROR_REINTENTABLE", codigo };
}

/**
 * Procesa UNA página de la recuperación: lista, guarda el inventario de cada ocurrencia y solo después
 * persiste la posición. Si cae entre medias, la página se repite y los upserts son idempotentes.
 */
export async function procesarPaginaRecuperacionZoom(
  deps: DepsProcesarPaginaRecuperacionZoom,
  barridoId: string
): Promise<ProgresoBarrido> {
  const reclamado = await deps.repoBarridos.reclamar(barridoId, deps.ahora(), deps.leaseMs);
  if (!reclamado) return { tipo: "NO_DISPONIBLE" };
  const { lease, barrido } = reclamado;

  const ventanas = particionarPeriodoZoom(barrido.desde, barrido.hasta, DIAS_VENTANA_LISTADO_GRABACIONES);
  const indiceVentana = barrido.posicion.ventanaDesde === null
    ? 0
    : ventanas.findIndex((v) => v.desde === barrido.posicion.ventanaDesde);
  const bruto = barrido.anfitriones[barrido.posicion.anfitrionIndice];
  if (indiceVentana < 0 || !bruto) return fallar(deps, lease, barrido, "POSICION_INVALIDA", { revision: true });
  const anfitrion: AnfitrionInventarioZoom = { cuentaZoomId: deps.cuentaZoomId, ...bruto };

  let pagina: ResultadoPagina<ReferenciaOcurrenciaZoom>;
  try {
    pagina = await deps.origen.listarOcurrencias(anfitrion, ventanas[indiceVentana]!, barrido.posicion.cursor);
  } catch (error) {
    const e = leerErrorZoom(error);
    const codigo = codigoDeError(error);
    // Usuario que ya no existe en la cuenta: se omite sin frenar a los demás anfitriones.
    if (e.code === "SOLICITUD_RECHAZADA" && e.status === 404 && e.codigoZoom === 1001) {
      const siguiente = posicionSiguiente(barrido, ventanas, indiceVentana, null, true);
      const ok = await deps.repoBarridos.avanzar(lease, { siguiente, ocurrencias: 0, anfitrionOmitidoCodigo: codigo }, deps.ahora());
      if (!ok) return { tipo: "LEASE_OBSOLETO" };
      return siguiente === null ? { tipo: "COMPLETADO", ocurrencias: 0 } : { tipo: "AVANZO", ocurrencias: 0 };
    }
    // Sin permisos (scope pendiente): reintentar no lo arregla; exige acción de administración.
    if (e.code === "CAPACIDAD_PENDIENTE" || (e.status === 400 && e.codigoZoom === 4711)) {
      return fallar(deps, lease, barrido, codigo, { revision: true });
    }
    // Cursor vencido: se reinicia la ventana, consumiendo un intento para no entrar en bucle.
    if (e.code === "SOLICITUD_RECHAZADA" && e.status === 400 && barrido.posicion.cursor !== null) {
      return fallar(deps, lease, barrido, codigo, { reiniciarCursor: true });
    }
    return fallar(deps, lease, barrido, codigo, {
      reintentarEnSegundos: typeof e.reintentarEnSegundos === "number" ? e.reintentarEnSegundos : null
    });
  }

  if (pagina.siguiente !== null && pagina.siguiente === barrido.posicion.cursor) {
    return fallar(deps, lease, barrido, "CURSOR_REPETIDO");
  }

  try {
    for (const referencia of pagina.elementos) {
      await inventariarZoomUseCase(deps.repoArchivos, deps.origen, {
        referencia, cuentaProveedorId: bruto.cuentaProveedorId, ahora: deps.ahora(), corteDias: deps.corteDias
      });
    }
  } catch (error) {
    // Sin avanzar: la página completa se repite; lo ya guardado se actualiza sin duplicarse.
    return fallar(deps, lease, barrido, codigoDeError(error));
  }

  const siguiente = posicionSiguiente(barrido, ventanas, indiceVentana, pagina.siguiente, false);
  const ok = await deps.repoBarridos.avanzar(lease, { siguiente, ocurrencias: pagina.elementos.length }, deps.ahora());
  if (!ok) return { tipo: "LEASE_OBSOLETO" };
  return siguiente === null
    ? { tipo: "COMPLETADO", ocurrencias: pagina.elementos.length }
    : { tipo: "AVANZO", ocurrencias: pagina.elementos.length };
}
