import type {
  EstadoIntegracionConferencia,
  IntegracionConferenciaHealth,
} from "@/src/modules/conferencias/api";

export {
  esErrorNoBloqueanteDeScopesMeet,
  requiereAtencionIntegracionMeet,
  estadoIntegracionEfectivo,
} from "@/src/modules/conferencias/api";

export type EstadoIntegracionMeet = EstadoIntegracionConferencia;
export type IntegracionMeetHealth = IntegracionConferenciaHealth;
