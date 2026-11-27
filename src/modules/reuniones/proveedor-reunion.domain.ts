export type ProveedorReunion = "GOOGLE_MEET" | "ZOOM";

/** Interpreta el parámetro `proveedor` de la URL: `null` significa sin filtro. */
export function resolverProveedorReunion(value?: string): ProveedorReunion | null {
  if (value === "meet") {
    return "GOOGLE_MEET";
  }
  if (value === "zoom") {
    return "ZOOM";
  }
  return null;
}

/**
 * Proveedor al que pertenece un encuentro. Debe coincidir con `filtroProveedorActivo`:
 * sin proveedor activo explícito (datos anteriores a la migración), Meet conserva el encuentro.
 */
export function proveedorActivoDeInstancia(
  instancia: Readonly<{
    proveedorActivoTipo?: string | null;
    eventosProveedor: readonly Readonly<{ proveedor: Readonly<{ tipo: string }> }>[];
  }>,
): ProveedorReunion {
  if (instancia.proveedorActivoTipo === "GOOGLE_MEET") {
    return "GOOGLE_MEET";
  }
  if (instancia.proveedorActivoTipo === "ZOOM") {
    return "ZOOM";
  }
  return instancia.eventosProveedor.some(({ proveedor }) => proveedor.tipo === "GOOGLE_MEET")
    ? "GOOGLE_MEET"
    : "ZOOM";
}

const TIENE_EVENTO_MEET = { proveedor: { tipo: "GOOGLE_MEET" } };

/** Condición de consulta sobre `InstanciaSala` para los encuentros de un proveedor. Meet y Zoom son complementarios. */
export function filtroProveedorActivo(proveedor: ProveedorReunion) {
  return proveedor === "GOOGLE_MEET"
    ? {
        OR: [
          { proveedorActivoTipo: "GOOGLE_MEET" },
          { proveedorActivoTipo: null, eventosProveedor: { some: TIENE_EVENTO_MEET } },
        ],
      }
    : {
        OR: [
          { proveedorActivoTipo: "ZOOM" },
          { proveedorActivoTipo: null, eventosProveedor: { none: TIENE_EVENTO_MEET } },
        ],
      };
}

type EncuentroDeSerie = Readonly<{
  estado: string;
  inicioProgramadoAt: Date;
  finProgramadoAt: Date;
  proveedor: ProveedorReunion;
}>;

/** Qué panel abre el detalle: el pedido si tiene encuentros; si no, el del próximo encuentro, o el del último. */
export function elegirProveedorDetalle(
  encuentros: readonly EncuentroDeSerie[],
  ahora: Date,
  solicitado: ProveedorReunion | null,
): Readonly<{
  proveedor: ProveedorReunion;
  otro: Readonly<{ proveedor: ProveedorReunion; cantidad: number }> | null;
}> {
  const activos = encuentros.filter(({ estado }) => estado !== "CANCELADA");
  const cuenta = (proveedor: ProveedorReunion) =>
    activos.filter((item) => item.proveedor === proveedor).length;

  const proximo = activos
    .filter(({ finProgramadoAt }) => finProgramadoAt >= ahora)
    .reduce<EncuentroDeSerie | null>(
      (menor, item) =>
        !menor || item.inicioProgramadoAt < menor.inicioProgramadoAt ? item : menor,
      null,
    );
  const ultimo = activos.reduce<EncuentroDeSerie | null>(
    (mayor, item) => (!mayor || item.inicioProgramadoAt > mayor.inicioProgramadoAt ? item : mayor),
    null,
  );
  const elegido: ProveedorReunion =
    solicitado && cuenta(solicitado) > 0 ? solicitado : ((proximo ?? ultimo)?.proveedor ?? "ZOOM");

  const otroProveedor: ProveedorReunion = elegido === "ZOOM" ? "GOOGLE_MEET" : "ZOOM";
  const cantidad = cuenta(otroProveedor);
  return { proveedor: elegido, otro: cantidad > 0 ? { proveedor: otroProveedor, cantidad } : null };
}
