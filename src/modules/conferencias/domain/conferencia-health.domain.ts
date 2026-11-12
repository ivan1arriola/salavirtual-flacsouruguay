import type { EstadoIntegracionConferencia, IntegracionConferenciaHealth } from "./conferencias.types";

/**
 * Un fallo de scopes de la API de Meet afecta la configuración adicional del
 * espacio (moderación, cohosts, reportes), pero no invalida un Meet que
 * Calendar ya creó y del que conservamos enlace/código.
 *
 * Los scopes se validan a nivel de configuración de Google Workspace, por lo
 * que este caso no debe degradar el estado operativo de cada encuentro.
 */
export function esErrorNoBloqueanteDeScopesMeet(event: IntegracionConferenciaHealth): boolean {
  return (
    event.estadoIntegracion === "ERROR" &&
    tieneMeet(event) &&
    esErrorDeScopesInsuficientes(event.errorIntegracion)
  );
}

export function requiereAtencionIntegracionMeet(event: IntegracionConferenciaHealth): boolean {
  return event.estadoIntegracion === "ERROR" || Boolean(event.errorIntegracion);
}

export function estadoIntegracionEfectivo(event: IntegracionConferenciaHealth): EstadoIntegracionConferencia {
  return esErrorNoBloqueanteDeScopesMeet(event) ? "SINCRONIZADA" : event.estadoIntegracion;
}

export function esErrorDeScopesInsuficientes(error: string | null | undefined): boolean {
  const normalized = error?.trim().toLowerCase() ?? "";
  if (!normalized) {
    return false;
  }

  return (
    normalized.includes("insufficient authentication scopes") ||
    normalized.includes("access_token_scope_insufficient") ||
    normalized.includes("insufficient_scope")
  );
}

function tieneMeet(event: IntegracionConferenciaHealth): boolean {
  return Boolean(event.joinUrl || event.codigoReunion);
}
