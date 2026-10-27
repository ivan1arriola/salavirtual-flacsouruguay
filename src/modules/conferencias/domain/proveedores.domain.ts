/**
 * Proveedores de videoconferencia operativos.
 *
 * Una solicitud elige un único proveedor (Google Meet o Zoom) y cada instancia
 * tiene a lo sumo un EventoProveedor operativo. Las consultas que buscan "el
 * evento de la reunión" deben usar este filtro en lugar de fijar GOOGLE_MEET;
 * las que llaman APIs propias de Meet (espacios, Calendar, Reports) siguen
 * filtrando por GOOGLE_MEET explícitamente.
 */
export const TIPOS_PROVEEDOR_OPERATIVO = ["GOOGLE_MEET", "ZOOM"] as const;

export type TipoProveedorOperativo = (typeof TIPOS_PROVEEDOR_OPERATIVO)[number];

/** Filtro Prisma por relación `proveedor`. Arreglo mutable: Prisma no acepta tuplas readonly. */
export const FILTRO_PROVEEDOR_OPERATIVO: { tipo: { in: TipoProveedorOperativo[] } } = {
  tipo: { in: ["GOOGLE_MEET", "ZOOM"] },
};

export function esProveedorOperativo(tipo: string | null | undefined): tipo is TipoProveedorOperativo {
  return tipo === "GOOGLE_MEET" || tipo === "ZOOM";
}

export function esProveedorZoom(tipo: string | null | undefined): boolean {
  return tipo === "ZOOM";
}

export function etiquetaProveedor(tipo: string | null | undefined): string {
  if (tipo === "ZOOM") return "Zoom";
  if (tipo === "ZOOM_HISTORICO") return "Zoom (histórico)";
  return "Google Meet";
}
