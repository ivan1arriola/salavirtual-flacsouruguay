import { ZoomHistoricoControl, ZoomReintentarArchivo } from "./zoom-historico-control";
import Link from "next/link";
import { formatDateTime } from "@/src/lib/ui/format";
import {
  categoriaArchivoZoom,
  describirVarianteZoom,
  enlaceArchivoZoom,
  esArchivoSecundarioZoom,
  etiquetaCategoriaZoom,
  filtrarArchivosZoomPorCategoria,
  respaldoCompletoZoom,
  etiquetaEstadoArchivoZoom,
  resumirArchivosZoom,
  type ArchivoInventarioZoomVista,
  type FiltroCategoriaZoom,
} from "@/src/modules/archivos/domain";
import type { PaginaInventarioZoom } from "@/src/modules/archivos/ports";

export const FILTROS_CATEGORIA_ZOOM: readonly FiltroCategoriaZoom[] = [
  "TODOS",
  "VIDEO",
  "AUDIO",
  "CHAT",
  "TRANSCRIPCION",
  "LINEA_DE_TIEMPO",
  "RESUMEN",
  "OTROS",
];

type VinculoZoom = "TODAS" | "SIN_VINCULO";
type EstadoNavegacionZoom = Readonly<{
  zoomPagina: number;
  zoomCategoria: FiltroCategoriaZoom;
  zoomVinculo: VinculoZoom;
}>;

function formatearBytes(bytes: bigint): string {
  const mb = Number(bytes) / (1024 * 1024);
  return mb >= 1024 ? `${(mb / 1024).toFixed(1)} GB` : `${mb.toFixed(1)} MB`;
}

export function etiquetaFiltroZoom(filtro: FiltroCategoriaZoom): string {
  return filtro === "TODOS" ? "Todos" : etiquetaCategoriaZoom(filtro);
}

export function hrefInventarioZoom(
  cambios: Partial<EstadoNavegacionZoom>,
  actual: EstadoNavegacionZoom,
): string {
  const v = { ...actual, ...cambios };
  const p = new URLSearchParams();
  if (v.zoomPagina > 1) {
    p.set("zoomPagina", String(v.zoomPagina));
  }
  if (v.zoomCategoria !== "TODOS") {
    p.set("zoomCategoria", v.zoomCategoria);
  }
  if (v.zoomVinculo !== "TODAS") {
    p.set("zoomVinculo", v.zoomVinculo);
  }
  const q = p.toString();
  return q ? `/grabaciones?${q}#archivos-zoom` : "/grabaciones#archivos-zoom";
}

export type ZoomArchivoProgresoProps = Readonly<{
  datos: PaginaInventarioZoom;
  categoria: FiltroCategoriaZoom;
  vinculo: VinculoZoom;
}>;

function renderFilaArchivoZoom(a: ArchivoInventarioZoomVista) {
  const href = enlaceArchivoZoom(a);
  const cat = etiquetaCategoriaZoom(categoriaArchivoZoom(a.tipoOriginal));
  const varianteLegible = describirVarianteZoom(a.variante, a.tipoOriginal) ?? a.variante;
  const ext = a.extension ? a.extension.toUpperCase() : null;
  const nombre = [cat, varianteLegible, ext].filter(Boolean).join(" · ");
  const conError =
    (a.estado === "ERROR_REINTENTABLE" || a.estado === "REQUIERE_REVISION") && a.errorCodigo;
  const estadoClase =
    a.estado === "CONSERVADO"
      ? "is-saved"
      : a.estado === "ERROR_REINTENTABLE" || a.estado === "REQUIERE_REVISION"
        ? "is-error"
        : "is-pending";

  return (
    <li key={a.id} className={`zoom-file-item ${estadoClase}`}>
      <div className="zoom-file-main">
        {href ? (
          <a href={href} className="zoom-file-link" target="_blank" rel="noreferrer">
            {nombre}
          </a>
        ) : (
          <span className="zoom-file-name">{nombre}</span>
        )}
        {a.tamanoBytes !== null ? (
          <span className="zoom-file-size">{formatearBytes(a.tamanoBytes)}</span>
        ) : null}
      </div>
      <div className="zoom-file-status-row">
        <span className={`zoom-file-state-badge ${estadoClase}`}>
          {etiquetaEstadoArchivoZoom(a.estado)}
          {conError ? ` (${a.errorCodigo})` : ""}
        </span>
        {a.estado === "ERROR_REINTENTABLE" || a.estado === "REQUIERE_REVISION" ? (
          <ZoomReintentarArchivo archivoId={a.id} />
        ) : null}
      </div>
    </li>
  );
}

/** Inventario de archivos de Zoom (solo administración). Todo texto lo escapa React; no hay HTML crudo. */
export function ZoomArchivoProgreso({ datos, categoria, vinculo }: ZoomArchivoProgresoProps) {
  const actual: EstadoNavegacionZoom = {
    zoomPagina: datos.pagina,
    zoomCategoria: categoria,
    zoomVinculo: vinculo,
  };
  return (
    <section
      id="archivos-zoom"
      className="zoom-inventory-section"
      aria-labelledby="archivos-zoom-titulo"
    >
      <div className="recording-library-heading zoom-inventory-heading">
        <div>
          <h2 id="archivos-zoom-titulo">Archivos de Zoom (Inventario de administración)</h2>
          <p className="zoom-inventory-subtitle">
            Ocurrencias inventariadas en Zoom, vinculación con encuentros y estado de conservación
            en Drive.
          </p>
        </div>
        <span>
          {datos.totalOcurrencias}{" "}
          {datos.totalOcurrencias === 1 ? "reunión con archivos" : "reuniones con archivos"}
        </span>
      </div>

      <nav
        className="recordings-controls zoom-inventory-controls"
        aria-label="Filtrar archivos de Zoom por categoría"
      >
        <div className="recordings-filter-tabs">
          {FILTROS_CATEGORIA_ZOOM.map((f) => (
            <Link
              key={f}
              className={`filter-tab ${f === categoria ? "is-active" : ""}`.trim()}
              aria-current={f === categoria ? "true" : undefined}
              href={hrefInventarioZoom({ zoomCategoria: f, zoomPagina: 1 }, actual)}
            >
              {etiquetaFiltroZoom(f)}
            </Link>
          ))}
          <Link
            className={`filter-tab is-link-filter ${vinculo === "SIN_VINCULO" ? "is-active" : ""}`.trim()}
            aria-current={vinculo === "SIN_VINCULO" ? "true" : undefined}
            href={hrefInventarioZoom(
              { zoomVinculo: vinculo === "TODAS" ? "SIN_VINCULO" : "TODAS", zoomPagina: 1 },
              actual,
            )}
          >
            {vinculo === "TODAS" ? "Solo sin vincular" : "Ver todas"}
          </Link>
        </div>
      </nav>

      {datos.ocurrencias.length === 0 ? (
        <div className="recordings-empty-state">
          <p role="status">
            No hay archivos de Zoom inventariados{vinculo === "SIN_VINCULO" ? " sin vincular" : ""}.
          </p>
        </div>
      ) : (
        <ul className="zoom-occurrence-list">
          {datos.ocurrencias.map((o) => {
            const resumen = resumirArchivosZoom(o.archivos);
            const completo = respaldoCompletoZoom(o.archivos, {
              procesamientoPendiente: o.procesamientoPendiente,
            });
            const visibles = filtrarArchivosZoomPorCategoria(o.archivos, categoria);
            const colapsar = categoria === "TODOS" && visibles.length > 6;
            const principales = colapsar
              ? visibles.filter((a) => !esArchivoSecundarioZoom(a) || a.estado !== "CONSERVADO")
              : visibles;
            const secundarios =
              colapsar && principales.length > 0
                ? visibles.filter((a) => esArchivoSecundarioZoom(a) && a.estado === "CONSERVADO")
                : [];

            return (
              <li key={o.id} className="recording-meeting-card zoom-occurrence-card">
                <header className="recording-meeting-header zoom-occurrence-header">
                  <div className="recording-meeting-date">
                    <span>{formatDateTime(o.inicioRealAt)}</span>
                    <strong>
                      {resumen.descubiertos} {resumen.descubiertos === 1 ? "archivo" : "archivos"}
                    </strong>
                    <small className="zoom-occurrence-size">
                      {resumen.bytesTotales !== null
                        ? `Tamaño total: ${formatearBytes(resumen.bytesTotales)}`
                        : `Tamaño parcial: ${formatearBytes(resumen.bytesConocidos)} (${resumen.tamanosDesconocidos} sin tamaño conocido)`}
                    </small>
                  </div>

                  <div className="recording-meeting-title">
                    <div className="zoom-occurrence-badges">
                      <span
                        className={`zoom-link-badge ${o.eventoProveedorId ? "is-linked" : "is-unlinked"}`}
                      >
                        {o.eventoProveedorId
                          ? "Vinculada a un encuentro"
                          : "Sin encuentro vinculado"}
                      </span>
                      <span className="zoom-inventory-timestamp">
                        {o.inventariadoAt
                          ? `Último inventario ${formatDateTime(o.inventariadoAt)}`
                          : "Sin inventario todavía"}
                      </span>
                    </div>
                    <h3>{o.titulo}</h3>
                    <p
                      role="status"
                      className={`zoom-backup-status ${completo ? "is-complete" : "is-incomplete"}`}
                    >
                      {completo
                        ? "Respaldo completo en Drive."
                        : o.procesamientoPendiente
                          ? "Respaldo incompleto: Zoom todavía procesa archivos de esta reunión."
                          : "Respaldo incompleto: faltan archivos por conservar."}
                    </p>
                  </div>

                  <div className="zoom-occurrence-counters" aria-label="Contadores de archivos">
                    <span className="zoom-counter-pill">Descubiertos {resumen.descubiertos}</span>
                    <span className="zoom-counter-pill is-saved">
                      Conservados {resumen.conservados}
                    </span>
                    <span className="zoom-counter-pill is-pending">
                      Pendientes {resumen.pendientes}
                    </span>
                    <span
                      className={`zoom-counter-pill ${resumen.revision > 0 ? "is-review" : ""}`.trim()}
                    >
                      En revisión {resumen.revision}
                    </span>
                  </div>
                </header>

                {!o.eventoProveedorId ? (
                  <div className="zoom-occurrence-link-bar">
                    <ZoomHistoricoControl
                      ocurrenciaId={o.id}
                      vinculado={Boolean(o.eventoProveedorId)}
                    />
                  </div>
                ) : (
                  <ZoomHistoricoControl
                    ocurrenciaId={o.id}
                    vinculado={Boolean(o.eventoProveedorId)}
                  />
                )}

                {visibles.length === 0 ? (
                  <p className="zoom-empty-category">No hay archivos en esta categoría.</p>
                ) : (
                  <>
                    <ul className="zoom-file-grid">{principales.map(renderFilaArchivoZoom)}</ul>
                    {secundarios.length > 0 ? (
                      <details className="recording-extra-files">
                        <summary className="recording-extra-summary">
                          <span>
                            Pistas individuales por participante y archivos auxiliares (
                            {secundarios.length})
                          </span>
                        </summary>
                        <ul className="zoom-file-grid is-nested">
                          {secundarios.map(renderFilaArchivoZoom)}
                        </ul>
                      </details>
                    ) : null}
                  </>
                )}
              </li>
            );
          })}
        </ul>
      )}

      {datos.totalPaginas > 1 ? (
        <div className="recordings-pagination" aria-label="Paginación de archivos de Zoom">
          {datos.pagina > 1 ? (
            <Link
              className="secondary-action"
              href={hrefInventarioZoom({ zoomPagina: datos.pagina - 1 }, actual)}
            >
              Anterior
            </Link>
          ) : null}
          <span>
            Página {datos.pagina} de {datos.totalPaginas}
          </span>
          {datos.pagina < datos.totalPaginas ? (
            <Link
              className="secondary-action"
              href={hrefInventarioZoom({ zoomPagina: datos.pagina + 1 }, actual)}
            >
              Siguiente
            </Link>
          ) : null}
        </div>
      ) : null}
    </section>
  );
}
