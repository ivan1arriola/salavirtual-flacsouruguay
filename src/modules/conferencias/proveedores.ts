/**
 * Superficie pública y liviana de los proveedores operativos. Otros módulos
 * (incluidos dominios importados por componentes cliente) la usan en lugar de
 * `conferencias/api`, que arrastra adaptadores de Google, Zoom y Prisma.
 */
export {
  TIPOS_PROVEEDOR_OPERATIVO,
  FILTRO_PROVEEDOR_OPERATIVO,
  esProveedorOperativo,
  esProveedorZoom,
  etiquetaProveedor,
  type TipoProveedorOperativo,
} from "./domain/proveedores.domain";
