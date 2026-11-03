import { seleccionarEventoProveedorActivo } from "./evento-proveedor-activo.domain";

export type EstadoEnlaceZoom = "LISTO" | "ATENCION" | "PENDIENTE" | "ERROR";

type EventoEnlace = Readonly<{
  joinUrl: string | null;
  estadoIntegracion: string;
  errorIntegracion: string | null;
}>;

export function estadoEnlaceZoom(evento: EventoEnlace | null): EstadoEnlaceZoom {
  if (!evento) return "PENDIENTE";
  if (evento.joinUrl) return evento.estadoIntegracion === "ERROR" ? "ATENCION" : "LISTO";
  return evento.estadoIntegracion === "ERROR" || evento.errorIntegracion ? "ERROR" : "PENDIENTE";
}

export type ResumenEnlaceZoom = Readonly<{
  eventoProveedorId: string | null;
  joinUrl: string | null;
  estado: EstadoEnlaceZoom;
  operacion: "PROVISIONAR" | "REPROGRAMAR" | "CONFIGURAR_MEET" | "CANCELAR";
}>;

const OPERACIONES = ["PROVISIONAR", "REPROGRAMAR", "CONFIGURAR_MEET", "CANCELAR"] as const;

/** Enlace vigente de una instancia: el del evento del proveedor activo. */
export function resumenEnlaceZoom(instancia: Readonly<{
  proveedorActivoTipo?: string | null;
  eventosProveedor: readonly (EventoEnlace & Readonly<{
    id: string;
    proveedor: Readonly<{ tipo: string }>;
    operacionPendiente: string | null;
  }>)[];
}>): ResumenEnlaceZoom {
  const evento = seleccionarEventoProveedorActivo(instancia);
  const operacion = OPERACIONES.find((valor) => valor === evento?.operacionPendiente) ?? "PROVISIONAR";
  return {
    eventoProveedorId: evento?.id ?? null,
    joinUrl: evento?.joinUrl ?? null,
    estado: estadoEnlaceZoom(evento),
    operacion
  };
}
