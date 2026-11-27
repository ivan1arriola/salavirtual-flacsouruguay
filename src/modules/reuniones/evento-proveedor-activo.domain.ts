type EventoConProveedor = Readonly<{
  proveedor: Readonly<{ tipo: string }>;
}>;

type InstanciaConEventos<T extends EventoConProveedor> = Readonly<{
  proveedorActivoTipo?: string | null;
  eventosProveedor: readonly T[];
}>;

/** Selecciona el enlace vigente sin depender del orden de los eventos en Prisma. */
export function seleccionarEventoProveedorActivo<T extends EventoConProveedor>(
  instancia: InstanciaConEventos<T>,
): T | null {
  if (instancia.proveedorActivoTipo != null) {
    return (
      instancia.eventosProveedor.find(
        ({ proveedor }) => proveedor.tipo === instancia.proveedorActivoTipo,
      ) ?? null
    );
  }

  // Compatibilidad con datos anteriores al proveedor activo explícito. Si se
  // preparó Zoom sin finalizar la conversión, Meet conserva el enlace vigente.
  return (
    instancia.eventosProveedor.find(({ proveedor }) => proveedor.tipo === "GOOGLE_MEET") ??
    instancia.eventosProveedor.find(({ proveedor }) => proveedor.tipo === "ZOOM") ??
    null
  );
}
