import type {
  ArchivoOrigenZoom,
  LeaseArchivoZoom,
  LimitesCupoZoom,
  PrioridadTransferenciaZoom,
  ReferenciaOcurrenciaZoom,
  ResultadoInventarioZoom
} from "../domain";

/** Ocurrencia observada en Zoom junto con los datos del inventario que la acompaña. */
export type OcurrenciaInventariadaZoom = Readonly<{
  referencia: ReferenciaOcurrenciaZoom;
  /** Sala/anfitrión local si se conoce; null conserva el valor ya guardado. */
  cuentaProveedorId: string | null;
  inventariadoAt: Date;
  proximoInventarioAt: Date | null;
}>;

export type ResumenInventarioGuardado = Readonly<{
  ocurrenciaId: string;
  nuevos: number;
  actualizados: number;
  /** Recursos que quedaron en REQUIERE_REVISION en este guardado (ambigüedad o colisión de nombre). */
  requierenRevision: number;
}>;

export type ProgresoArchivoZoom = Readonly<{
  /** Offset confirmado por Drive (fuente de verdad, puede retroceder si la sesión se reinicia). */
  bytesConfirmados: bigint;
  /** Sesión de subida ya cifrada; undefined no la modifica, null la borra. */
  uploadSessionCifrada?: string | null;
  /** ID de Drive pregenerado y persistido antes del POST; undefined no lo modifica. */
  driveFileId?: string | null;
  /** Heartbeat: nuevo vencimiento del lease vigente. */
  leaseHasta?: Date;
}>;

export type DestinoConservadoZoom = Readonly<{
  id: string;
  nombre: string;
  tamanoBytes: bigint;
  mimeType: string | null;
  webViewUrl: string | null;
}>;

export type FalloArchivoZoom = Readonly<{
  /**
   * REINTENTABLE consume un intento (ERROR_REINTENTABLE, o REQUIERE_REVISION al llegar a
   * limiteIntentos); ESPERA vuelve a PENDIENTE sin consumir intentos (p. ej. TOPE_DIARIO);
   * REVISION exige intervención (REQUIERE_REVISION).
   */
  tipo: "REINTENTABLE" | "ESPERA" | "REVISION";
  codigo: string;
  /** Se sanea antes de persistir: nunca se guardan URLs ni tokens. */
  detalle?: string | null;
  proximoIntentoAt: Date | null;
  limiteIntentos?: number | null;
}>;

/** Datos del trabajo reclamado, solo mientras el lease sigue vigente. */
export type ArchivoReclamadoZoom = Readonly<{
  lease: LeaseArchivoZoom;
  ocurrenciaId: string;
  ocurrencia: ReferenciaOcurrenciaZoom;
  eventoProveedorId: string | null;
  driveFolderId: string | null;
  recurso: ArchivoOrigenZoom;
  nombreDestino: string;
  driveFileId: string | null;
  uploadSessionCifrada: string | null;
  bytesConfirmados: bigint;
  intentos: number;
}>;

export type SolicitudReservaTransferenciaZoom = Readonly<{
  bytes: bigint;
  prioridad: PrioridadTransferenciaZoom;
  ahora: Date;
  limites: LimitesCupoZoom;
}>;

export type ResultadoReservaTransferenciaZoom =
  | Readonly<{ tipo: "RESERVADA"; reservaId: string; bytesReservados: bigint }>
  | Readonly<{ tipo: "SIN_CUPO"; disponibleBytes: bigint; liberacionEstimadaAt: Date | null }>
  | Readonly<{ tipo: "LEASE_OBSOLETO" }>;

/** Usuario que vincula o desvincula; null para asociaciones automáticas del sistema. */
export type ActorVinculoZoom = Readonly<{ id: string }>;

export type ResultadoVinculo =
  | Readonly<{ tipo: "VINCULADA"; referenciasCreadas: number }>
  | Readonly<{ tipo: "YA_VINCULADA" }>
  | Readonly<{ tipo: "VINCULADA_A_OTRO"; eventoProveedorId: string }>
  | Readonly<{ tipo: "EVENTO_NO_ZOOM" }>
  | Readonly<{ tipo: "NO_ENCONTRADA"; recurso: "OCURRENCIA" | "EVENTO" }>;

export type ResultadoDesvinculo =
  | Readonly<{ tipo: "DESVINCULADA"; referenciasEliminadas: number }>
  | Readonly<{ tipo: "NO_VINCULADA" }>
  | Readonly<{ tipo: "NO_ENCONTRADA" }>;

/**
 * Persistencia del inventario Zoom y de las transferencias reanudables. Todas las
 * mutaciones de worker comparan la versión vigente del lease: un worker obsoleto
 * recibe false (o LEASE_OBSOLETO) y nunca confirma resultados.
 */
export type ZoomArchivoRepositoryPort = Readonly<{
  guardarInventario(ocurrencia: OcurrenciaInventariadaZoom, inventario: ResultadoInventarioZoom): Promise<ResumenInventarioGuardado>;
  /** Ocurrencias cuyo próximo inventario ya venció (proximoInventarioAt <= ahora), las más atrasadas primero. */
  listarOcurrenciasPorInventariar(ahora: Date, limite: number): Promise<readonly { referencia: ReferenciaOcurrenciaZoom; cuentaProveedorId: string | null }[]>;
  /** Fija la carpeta de Drive de la ocurrencia solo si aún no tenía una (la primera resolución gana). */
  guardarCarpetaOcurrencia(ocurrenciaId: string, driveFolderId: string): Promise<boolean>;
  reclamarArchivo(ahora: Date, duracionMs: number): Promise<LeaseArchivoZoom | null>;
  obtenerArchivoReclamado(lease: LeaseArchivoZoom): Promise<ArchivoReclamadoZoom | null>;
  guardarProgreso(lease: LeaseArchivoZoom, progreso: ProgresoArchivoZoom): Promise<boolean>;
  confirmarConservado(lease: LeaseArchivoZoom, destino: DestinoConservadoZoom): Promise<boolean>;
  registrarFallo(lease: LeaseArchivoZoom, fallo: FalloArchivoZoom): Promise<boolean>;
  /** Reserva atómica (entre workers) del cupo de transferencia de la ventana móvil. */
  reservarTransferencia(lease: LeaseArchivoZoom, solicitud: SolicitudReservaTransferenciaZoom): Promise<ResultadoReservaTransferenciaZoom>;
  /** Ajusta la reserva a los bytes realmente transferidos; solo una vez por reserva. */
  liberarReserva(reservaId: string, bytesTransferidos: bigint, ahora: Date): Promise<boolean>;
  vincularOcurrencia(ocurrenciaId: string, eventoId: string, actor: ActorVinculoZoom | null): Promise<ResultadoVinculo>;
  desvincularOcurrencia(ocurrenciaId: string, eventoId: string, actor: ActorVinculoZoom | null): Promise<ResultadoDesvinculo>;
}>;
