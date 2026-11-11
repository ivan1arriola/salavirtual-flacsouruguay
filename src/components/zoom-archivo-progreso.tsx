import { ZoomHistoricoControl, ZoomReintentarArchivo } from "./zoom-historico-control";
import Link from "next/link";
import { formatDateTime } from "@/src/lib/ui/format";
import {
  categoriaArchivoZoom,
  enlaceArchivoZoom,
  etiquetaCategoriaZoom,
  filtrarArchivosZoomPorCategoria,
  respaldoCompletoZoom,
  etiquetaEstadoArchivoZoom,
  resumirArchivosZoom,
  type EstadoArchivoZoomVista,
  type FiltroCategoriaZoom
} from "@/src/modules/archivos/domain";
import type { PaginaInventarioZoom } from "@/src/modules/archivos/ports";

export const FILTROS_CATEGORIA_ZOOM: readonly FiltroCategoriaZoom[] = [
  "TODOS", "VIDEO", "AUDIO", "CHAT", "TRANSCRIPCION", "LINEA_DE_TIEMPO", "RESUMEN", "OTROS"
];

type VinculoZoom = "TODAS" | "SIN_VINCULO";
type EstadoNavegacionZoom = Readonly<{ zoomPagina: number; zoomCategoria: FiltroCategoriaZoom; zoomVinculo: VinculoZoom }>;


function formatearBytes(bytes: bigint): string {
  const mb = Number(bytes) / (1024 * 1024);
  return mb >= 1024 ? `${(mb / 1024).toFixed(1)} GB` : `${mb.toFixed(1)} MB`;
}

export function etiquetaFiltroZoom(filtro: FiltroCategoriaZoom): string {
  return filtro === "TODOS" ? "Todos" : etiquetaCategoriaZoom(filtro);
}

export function hrefInventarioZoom(cambios: Partial<EstadoNavegacionZoom>, actual: EstadoNavegacionZoom): string {
  const v = { ...actual, ...cambios };
  const p = new URLSearchParams();
  if (v.zoomPagina > 1) p.set("zoomPagina", String(v.zoomPagina));
  if (v.zoomCategoria !== "TODOS") p.set("zoomCategoria", v.zoomCategoria);
  if (v.zoomVinculo !== "TODAS") p.set("zoomVinculo", v.zoomVinculo);
  const q = p.toString();
  return q ? `/grabaciones?${q}#archivos-zoom` : "/grabaciones#archivos-zoom";
}

export type ZoomArchivoProgresoProps = Readonly<{
  datos: PaginaInventarioZoom;
  categoria: FiltroCategoriaZoom;
  vinculo: VinculoZoom;
}>;

/** Inventario de archivos de Zoom (solo administración). Todo texto lo escapa React; no hay HTML crudo. */
export function ZoomArchivoProgreso({ datos, categoria, vinculo }: ZoomArchivoProgresoProps) {
  const actual: EstadoNavegacionZoom = { zoomPagina: datos.pagina, zoomCategoria: categoria, zoomVinculo: vinculo };
  return (
    <section id="archivos-zoom" className="recording-library-heading" aria-labelledby="archivos-zoom-titulo">
      <h2 id="archivos-zoom-titulo">Archivos de Zoom</h2>
      <span>{datos.totalOcurrencias} {datos.totalOcurrencias === 1 ? "reunión con archivos" : "reuniones con archivos"}</span>

      <nav aria-label="Filtrar archivos de Zoom por categoría" style={{ display: "flex", flexWrap: "wrap", gap: 8, margin: "10px 0" }}>
        {FILTROS_CATEGORIA_ZOOM.map((f) => (
          <Link key={f} className="secondary-action" aria-current={f === categoria ? "true" : undefined}
            href={hrefInventarioZoom({ zoomCategoria: f, zoomPagina: 1 }, actual)}>
            {etiquetaFiltroZoom(f)}
          </Link>
        ))}
        <Link className="secondary-action" aria-current={vinculo === "SIN_VINCULO" ? "true" : undefined}
          href={hrefInventarioZoom({ zoomVinculo: vinculo === "TODAS" ? "SIN_VINCULO" : "TODAS", zoomPagina: 1 }, actual)}>
          {vinculo === "TODAS" ? "Solo sin vincular" : "Ver todas"}
        </Link>
      </nav>

      {datos.ocurrencias.length === 0 ? (
        <p role="status">No hay archivos de Zoom inventariados{vinculo === "SIN_VINCULO" ? " sin vincular" : ""}.</p>
      ) : (
        <ul style={{ listStyle: "none", padding: 0, display: "grid", gap: 12 }}>
          {datos.ocurrencias.map((o) => {
            const resumen = resumirArchivosZoom(o.archivos);
            const completo = respaldoCompletoZoom(o.archivos, { procesamientoPendiente: o.procesamientoPendiente });
            const visibles = filtrarArchivosZoomPorCategoria(o.archivos, categoria);
            return (
              <li key={o.id} className="recording-meeting-card">
                <h3>{o.titulo}</h3>
                <p>
                  {formatDateTime(o.inicioRealAt)} · {o.eventoProveedorId ? "Vinculada a un encuentro" : "Sin encuentro vinculado"}
                  {o.inventariadoAt ? ` · Último inventario ${formatDateTime(o.inventariadoAt)}` : " · Sin inventario todavía"}
                </p>
                <ZoomHistoricoControl ocurrenciaId={o.id} vinculado={Boolean(o.eventoProveedorId)} />
                <p aria-label="Contadores de archivos">
                  Descubiertos {resumen.descubiertos} · Conservados {resumen.conservados} · Pendientes {resumen.pendientes} · En revisión {resumen.revision}
                </p>
                <p>
                  {resumen.bytesTotales !== null
                    ? `Tamaño total: ${formatearBytes(resumen.bytesTotales)}`
                    : `Tamaño parcial: ${formatearBytes(resumen.bytesConocidos)} (${resumen.tamanosDesconocidos} sin tamaño conocido)`}
                </p>
                <p role="status">
                  {completo
                    ? "Respaldo completo en Drive."
                    : o.procesamientoPendiente
                      ? "Respaldo incompleto: Zoom todavía procesa archivos de esta reunión."
                      : "Respaldo incompleto: faltan archivos por conservar."}
                </p>
                {visibles.length === 0 ? (
                  <p>No hay archivos en esta categoría.</p>
                ) : (
                  <ul style={{ paddingLeft: 18 }}>
                    {visibles.map((a) => {
                      const href = enlaceArchivoZoom(a);
                      const nombre = [etiquetaCategoriaZoom(categoriaArchivoZoom(a.tipoOriginal)), a.variante, a.extension].filter(Boolean).join(" · ");
                      const conError = (a.estado === "ERROR_REINTENTABLE" || a.estado === "REQUIERE_REVISION") && a.errorCodigo;
                      return (
                        <li key={a.id}>
                          {href ? <a href={href} target="_blank" rel="noreferrer">{nombre}</a> : <span>{nombre}</span>}
                          {" — "}{etiquetaEstadoArchivoZoom(a.estado)}{conError ? ` (${a.errorCodigo})` : ""}
                          {(a.estado === "ERROR_REINTENTABLE" || a.estado === "REQUIERE_REVISION") && <ZoomReintentarArchivo archivoId={a.id} />}
                        </li>
                      );
                    })}
                  </ul>
                )}
              </li>
            );
          })}
        </ul>
      )}

      {datos.totalPaginas > 1 ? (
        <div className="recordings-pagination" aria-label="Paginación de archivos de Zoom">
          {datos.pagina > 1 ? <Link className="secondary-action" href={hrefInventarioZoom({ zoomPagina: datos.pagina - 1 }, actual)}>Anterior</Link> : null}
          <span>Página {datos.pagina} de {datos.totalPaginas}</span>
          {datos.pagina < datos.totalPaginas ? <Link className="secondary-action" href={hrefInventarioZoom({ zoomPagina: datos.pagina + 1 }, actual)}>Siguiente</Link> : null}
        </div>
      ) : null}
    </section>
  );
}
