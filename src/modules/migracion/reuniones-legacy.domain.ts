export function normalizarNombrePrograma(nombre: string): string {
  return nombre.trim().replace(/\s+/g, " ");
}

export function mapearEstadoSolicitudLegacy(
  estado: string
): "REGISTRADA" | "PROVISIONANDO" | "PROVISIONADA" | "REQUIERE_REVISION" | "CANCELADA" {
  if (estado === "PROVISIONADA") return "PROVISIONADA";
  if (estado.startsWith("CANCELADA")) return "CANCELADA";
  if (estado === "PROVISIONANDO") return "PROVISIONANDO";
  return "REQUIERE_REVISION";
}

export function mapearEstadoInstanciaLegacy(
  estado: string
): "PROGRAMADA" | "FINALIZADA" | "CANCELADA" | "NO_REALIZADA" {
  if (estado === "FINALIZADO") return "FINALIZADA";
  if (estado === "CANCELADO") return "CANCELADA";
  if (estado === "NO_REALIZADO") return "NO_REALIZADA";
  return "PROGRAMADA";
}

export function mapearEstadoAsignacionLegacy(
  estado: string
): "ASIGNADO" | "ACEPTADO" | "RECHAZADO" | "CANCELADO" {
  if (estado === "ACEPTADO") return "ACEPTADO";
  if (estado === "RECHAZADO") return "RECHAZADO";
  if (estado === "CANCELADO" || estado === "REASIGNADO") return "CANCELADO";
  return "ASIGNADO";
}

export function mapearTipoInstanciasLegacy(tipo: string): "UNICA" | "MULTIPLE" {
  return tipo === "UNICA" ? "UNICA" : "MULTIPLE";
}
