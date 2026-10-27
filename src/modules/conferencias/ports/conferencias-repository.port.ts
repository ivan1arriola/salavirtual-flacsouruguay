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
import type { TipoProveedorOperativo } from "../domain/proveedores.domain";
import type { ZoomCredentialsResult } from "./zoom-conference-provider.port";

export type EventoProveedorSnapshot = Readonly<{
  id: string;
  /** Ausente = GOOGLE_MEET (compatibilidad). */
  tipoProveedor?: TipoProveedorOperativo;
  estadoIntegracion: EstadoIntegracionConferencia;
  operacionPendiente: OperacionPendienteConferencia | null;
  reclamoIntegracionAt: Date | null;
  errorIntegracion: string | null;
}>;

export type EventoReclamableInfo = Readonly<{
  id: string;
  /** Ausente = GOOGLE_MEET (compatibilidad). */
  tipoProveedor?: TipoProveedorOperativo;
  externalEventId: string | null;
  solicitudSalaId: string;
  organizerEmail: string;
  request: ConferenceProvisionRequest;
}>;

export type ClaimInfo = Readonly<{
  event: EventoReclamableInfo;
  operacion: OperacionPendienteConferencia;
  at: Date;
  token: string;
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

  obtenerCredencialesZoom?: () => Promise<ZoomCredentialsResult>;

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
}>;

