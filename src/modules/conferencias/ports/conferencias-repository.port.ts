import type {
  ConferenceProvisionRequest,
  ConferenceProvisionResult,
  DescartarLoteResult,
  DescartarOperacionResult,
  EstadoIntegracionConferencia,
  OperacionPendienteConferencia,
  ProvisionConferenciaResult,
  ReclasificarLoteResult,
} from "../domain/conferencias.types";

export type EventoProveedorSnapshot = Readonly<{
  id: string;
  estadoIntegracion: EstadoIntegracionConferencia;
  operacionPendiente: OperacionPendienteConferencia | null;
  reclamoIntegracionAt: Date | null;
  errorIntegracion: string | null;
}>;

export type EventoReclamableInfo = Readonly<{
  id: string;
  proveedorTipo: string;
  externalEventId: string | null;
  solicitudSalaId: string;
  organizerEmail: string;
  request: ConferenceProvisionRequest;
  /** Reunión externa compartida por la serie (Zoom). Nulo o ausente: el evento tiene su propia reunión. */
  reunionProveedorId?: string | null;
  serieClave?: string | null;
}>;

export type ReclamoReunionCompartida = Readonly<{
  reunionId: string;
  resultado: "RECLAMADA" | "EN_CURSO_POR_OTRO" | "YA_CREADA";
  externalId: string | null;
  joinUrl: string | null;
}>;

export type UsoReunionCompartidaInfo = Readonly<{
  eventoProveedorId: string;
  instanciaEstado: string;
  instanciaFin: Date;
}>;

export type EstadoReunionCompartida = Readonly<{
  usos: readonly UsoReunionCompartidaInfo[];
  externalId: string | null;
  eliminada: boolean;
}>;

export type ClaimInfo = Readonly<{
  event: EventoReclamableInfo;
  operacion: OperacionPendienteConferencia;
  at: Date;
  token: string;
}>;

export type ZoomCredentialsResult = Readonly<{
  disponible: boolean;
  accountId?: string;
  clientId?: string;
  clientSecret?: string;
  error?: string;
}>;

export type WorkspaceCredentialsResult = Readonly<{
  disponible: boolean;
  serviceAccountEmail?: string;
  privateKey?: string;
  error?: string;
}>;

export type ConferenciasRepositoryPort = Readonly<{
  obtenerSnapshotsEventos: (
    ids: readonly string[]
  ) => Promise<readonly EventoProveedorSnapshot[]>;

  obtenerCredencialesWorkspace: () => Promise<WorkspaceCredentialsResult>;
  obtenerCredencialesZoom: () => Promise<ZoomCredentialsResult>;

  reclamarEvento: (
    id: string
  ) => Promise<ClaimInfo | null>;

  buscarConferenceDataCompartida: (
    solicitudSalaId: string,
    excludeEventoId: string
  ) => Promise<Readonly<Record<string, unknown>> | undefined>;

  guardarExternalEventIdTemprano: (
    claim: ClaimInfo,
    externalEventId: string,
    payload: unknown
  ) => Promise<void>;

  persistirMeetDetectado: (
    claim: ClaimInfo,
    result: ConferenceProvisionResult
  ) => Promise<void>;

  finalizarOperacion: (
    claim: ClaimInfo,
    result: ConferenceProvisionResult | null,
    cancelacion: boolean
  ) => Promise<boolean>;

  registrarErrorReclamado: (
    claim: ClaimInfo,
    error: string,
    scopeConfiguracionMeet?: boolean
  ) => Promise<ProvisionConferenciaResult>;

  registrarErrorSinClaim: (
    id: string,
    error: string
  ) => Promise<ProvisionConferenciaResult>;

  obtenerEstadoActual: (
    id: string
  ) => Promise<ProvisionConferenciaResult>;

  descartarOperacionPendiente: (
    id: string
  ) => Promise<DescartarOperacionResult>;

  descartarOperacionesNoBloqueantesLote: () => Promise<DescartarLoteResult>;

  reclasificarOperacionesPendientesLote?: () => Promise<ReclasificarLoteResult>;

  // Reunión compartida por serie. Opcionales: solo se usan con eventos que tienen `reunionProveedorId`.

  /** Reclama la creación con una actualización condicional (PENDIENTE -> CREANDO, o un reclamo vencido). */
  reclamarCreacionReunionCompartida?: (
    eventoProveedorId: string,
    token: string,
    ahora: Date
  ) => Promise<ReclamoReunionCompartida | null>;

  /** Guarda el ID de Zoom apenas se recibe; solo si el token sigue siendo el del reclamo. */
  registrarExternalIdTemprano?: (
    reunionId: string,
    token: string,
    externalId: string
  ) => Promise<void>;

  /** Pasa la reunión a CREADA y copia `externalEventId`/`joinUrl` a sus eventos. */
  guardarReunionCompartida?: (
    reunionId: string,
    token: string,
    datos: Readonly<{ externalId: string; joinUrl: string }>
  ) => Promise<void>;

  usosDeReunionCompartida?: (reunionId: string) => Promise<EstadoReunionCompartida>;

  /** Condicional: devuelve true solo si pasó a ELIMINADA en esta llamada. */
  marcarReunionCompartidaEliminada?: (reunionId: string) => Promise<boolean>;

  /**
   * Deja el evento reclamado apuntando a la reunión compartida (ID y enlace). Idempotente:
   * acepta un evento sin ID o que ya tiene el mismo. Falla si el claim del evento caducó.
   */
  vincularEventoReunionCompartida?: (
    claim: ClaimInfo,
    datos: Readonly<{ externalId: string; joinUrl: string }>
  ) => Promise<void>;

  /** Limpia el reclamo del evento sin tocar su operación pendiente, para reintentar enseguida. */
  liberarReclamoEvento?: (claim: ClaimInfo) => Promise<void>;
}>;

