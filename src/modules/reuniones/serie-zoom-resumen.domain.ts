import { seleccionarEventoProveedorActivo } from "./evento-proveedor-activo.domain";

type EncuentroConEnlace = Readonly<{
  proveedorActivoTipo?: string | null;
  eventosProveedor: readonly Readonly<{
    joinUrl: string | null;
    proveedor: Readonly<{ tipo: string }>;
    cuentaProveedor?: Readonly<{ nombre: string; emailOrganizador: string | null }> | null;
  }>[];
}>;

export type ResumenSerieZoom = Readonly<{
  /** Todos los encuentros comparten cuenta anfitriona y enlace (o aún no tienen ninguno). */
  unificada: boolean;
  cuentas: readonly string[];
  enlaces: readonly string[];
}>;

const distintos = (valores: readonly (string | null | undefined)[]): readonly string[] =>
  valores.reduce<readonly string[]>(
    (acumulado, valor) => (valor && !acumulado.includes(valor) ? [...acumulado, valor] : acumulado),
    []
  );

/** Cuentas y enlaces vigentes de una serie; más de una cuenta o de un enlace pide corrección. */
export function resumirSerieZoom(encuentros: readonly EncuentroConEnlace[]): ResumenSerieZoom {
  const eventos = encuentros.map((encuentro) => seleccionarEventoProveedorActivo(encuentro));
  const cuentas = distintos(
    eventos.map((evento) => evento?.cuentaProveedor?.emailOrganizador ?? evento?.cuentaProveedor?.nombre)
  );
  const enlaces = distintos(eventos.map((evento) => evento?.joinUrl));
  return { unificada: cuentas.length <= 1 && enlaces.length <= 1, cuentas, enlaces };
}
