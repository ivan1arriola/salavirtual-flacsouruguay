/** Anfitrión validado al crear el barrido (la lista queda fija aunque cambie la configuración). */
export type AnfitrionBarridoZoom = Readonly<{ anfitrionZoomId: string; cuentaProveedorId: string | null }>;

export type EstadoBarridoZoom =
  "PENDIENTE" | "EN_CURSO" | "COMPLETADO" | "ERROR_REINTENTABLE" | "REQUIERE_REVISION" | "CANCELADO";

/** Posición persistida: anfitrión, ventana (fecha inicial inclusiva) y cursor de la página SIGUIENTE a procesar. */
export type FuenteListadoZoom = "ACTIVAS" | "PAPELERA";

export type PosicionBarridoZoom = Readonly<{
  anfitrionIndice: number;
  /** Listado en curso dentro de la ventana: primero las activas y luego la papelera, cada una con su cursor. */
  fuente: FuenteListadoZoom;
  /** null = primera ventana del periodo. */
  ventanaDesde: string | null;
  cursor: string | null;
}>;

export type BarridoZoom = Readonly<{
  id: string;
  cuentaZoomId: string;
  anfitriones: readonly AnfitrionBarridoZoom[];
  /** Fechas inclusivas YYYY-MM-DD. */
  desde: string;
  hasta: string;
  posicion: PosicionBarridoZoom;
  estado: EstadoBarridoZoom;
  paginasProcesadas: number;
  ocurrenciasEncontradas: number;
  intentos: number;
  errorCodigo: string | null;
  /** Anfitriones omitidos (`anfitrion:codigo`): mientras haya alguno el barrido no se declara completo. */
  omisiones: readonly string[];
  completadoAt: Date | null;
}>;

export type LeaseBarridoZoom = Readonly<{ barridoId: string; version: number; venceAt: Date }>;

export type NuevoBarridoZoom = Readonly<{
  cuentaZoomId: string;
  anfitriones: readonly AnfitrionBarridoZoom[];
  desde: string;
  hasta: string;
  solicitanteId: string | null;
}>;

export type AvanceBarridoZoom = Readonly<{
  /** Posición siguiente; null = el barrido terminó. */
  siguiente: PosicionBarridoZoom | null;
  ocurrencias: number;
  /** Anfitrión omitido (p. ej. usuario inexistente): se registra y no impide los demás, pero el barrido no queda completo. */
  omision?: Readonly<{ anfitrionZoomId: string; codigo: string }>;
  /** No reinicia `intentos`: se avanzó dentro de la misma ventana, donde un fallo recurrente debe agotar el límite. */
  conservarIntentos?: boolean;
}>;

export type FalloBarridoZoom = Readonly<{
  tipo: "REINTENTABLE" | "REVISION";
  codigo: string;
  proximoIntentoAt: Date | null;
  /** Reinicia la ventana actual (cursor vencido): las ocurrencias se vuelven a guardar con upserts idempotentes. */
  reiniciarCursor?: boolean;
  limiteIntentos?: number | null;
}>;

/** Todas las mutaciones comparan la versión del lease: un worker obsoleto recibe false y no confirma nada. */
export type BarridoZoomRepositoryPort = Readonly<{
  crear(barrido: NuevoBarridoZoom): Promise<Readonly<{ id: string }>>;
  obtener(barridoId: string): Promise<BarridoZoom | null>;
  /** Reclama un barrido PENDIENTE/EN_CURSO/ERROR_REINTENTABLE listo para reintento, o con lease vencido. */
  reclamar(
    barridoId: string,
    ahora: Date,
    duracionMs: number
  ): Promise<Readonly<{ lease: LeaseBarridoZoom; barrido: BarridoZoom }> | null>;
  /** Persiste la posición DESPUÉS de haber guardado la página (nunca antes). */
  avanzar(lease: LeaseBarridoZoom, avance: AvanceBarridoZoom, ahora: Date): Promise<boolean>;
  registrarFallo(lease: LeaseBarridoZoom, fallo: FalloBarridoZoom): Promise<boolean>;
  /** Ids de barridos con trabajo vencido, para que el worker los continúe. */
  listarPendientes(ahora: Date, limite: number): Promise<readonly string[]>;
}>;
