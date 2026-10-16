"use client";

import { Clock, ExternalLink, FileSpreadsheet, FileText, FolderOpen, NotebookText, Search, UsersRound, Video, X } from "lucide-react";
import { useState } from "react";
import { formatDateTime } from "@/src/lib/ui/format";
import {
  type GrupoEncuentroConArchivos,
  type TipoFiltroArtefacto
} from "@/src/modules/archivos/presentation";
import { crearHrefGrabaciones } from "@/src/modules/archivos/domain/grabaciones-query.domain";
import {
  etiquetaTipoArtefactoMeet,
  type TipoArtefactoMeet
} from "@/src/modules/archivos/presentation";

export type RecordingsLibraryProps = Readonly<{
  grupos: readonly GrupoEncuentroConArchivos[];
  pagina: number;
  totalPaginas: number;
  busqueda: string;
  filtro: TipoFiltroArtefacto;
  totalEncuentros: number;
  conteos: Readonly<{ todos: number; grabaciones: number; asistencias: number; notas: number; transcripciones: number }>;
}>;

export function RecordingsLibrary({ grupos, pagina: paginaVisible, totalPaginas, busqueda, filtro, conteos, totalEncuentros }: RecordingsLibraryProps) {
  const [busquedaEditada, setBusquedaEditada] = useState(busqueda);
  const filteredGrupos = grupos;
  const gruposPagina = grupos;
  const navegar = (cambios: Partial<{ pagina: number; busqueda: string; filtro: TipoFiltroArtefacto }>) => {
    window.location.assign(crearHrefGrabaciones({ pagina: paginaVisible, busqueda, filtro }, cambios));
  };

  return (
    <div className="recordings-library-container">
      <div className="recordings-controls">
        <div className="recordings-search-bar">
          <Search size={18} className="search-icon" aria-hidden="true" />
          <input
            type="text"
            placeholder="Buscar por materia, clase o docente..."
            value={busqueda}
            onChange={(e) => setBusquedaEditada(e.target.value)}
            onKeyDown={(e) => { if (e.key === "Enter") navegar({ busqueda: busquedaEditada, pagina: 1 }); }}
            aria-label="Buscar encuentros o archivos"
          />
          {busqueda ? (
            <button
              type="button"
              className="clear-search-button"
              onClick={() => navegar({ busqueda: "", pagina: 1 })}
              aria-label="Limpiar búsqueda"
            >
              <X size={16} />
            </button>
          ) : null}
        </div>

        <div className="recordings-filter-tabs" role="tablist" aria-label="Filtrar por tipo de archivo">
          <button
            type="button"
            role="tab"
            aria-selected={filtro === "TODOS"}
            className={`filter-tab ${filtro === "TODOS" ? "is-active" : ""}`}
            onClick={() => navegar({ filtro: "TODOS", pagina: 1 })}
          >
            Todos <span className="tab-badge">{conteos.todos}</span>
          </button>
          <button
            type="button"
            role="tab"
            aria-selected={filtro === "GRABACIONES"}
            className={`filter-tab ${filtro === "GRABACIONES" ? "is-active" : ""}`}
            onClick={() => navegar({ filtro: "GRABACIONES", pagina: 1 })}
          >
            <Video size={14} aria-hidden="true" />
            Solo grabaciones <span className="tab-badge">{conteos.grabaciones}</span>
          </button>
          <button
            type="button"
            role="tab"
            aria-selected={filtro === "ASISTENCIAS"}
            className={`filter-tab ${filtro === "ASISTENCIAS" ? "is-active" : ""}`}
            onClick={() => navegar({ filtro: "ASISTENCIAS", pagina: 1 })}
          >
            <UsersRound size={14} aria-hidden="true" />
            Solo asistencias <span className="tab-badge">{conteos.asistencias}</span>
          </button>
          <button
            type="button"
            role="tab"
            aria-selected={filtro === "NOTAS_Y_TRANSCRIPCIONES"}
            className={`filter-tab ${filtro === "NOTAS_Y_TRANSCRIPCIONES" ? "is-active" : ""}`}
            onClick={() => navegar({ filtro: "NOTAS_Y_TRANSCRIPCIONES", pagina: 1 })}
          >
            <NotebookText size={14} aria-hidden="true" />
            Notas y transcripciones <span className="tab-badge">{conteos.notas}</span>
          </button>
        </div>
      </div>

      {filteredGrupos.length === 0 ? (
        <div className="recordings-empty-state">
          <Video size={36} className="empty-icon" aria-hidden="true" />
          <h3>No se encontraron encuentros ni archivos</h3>
          <p>Prueba ajustando el término de búsqueda o cambiando el filtro seleccionado.</p>
          {busqueda || filtro !== "TODOS" ? (
            <button
              type="button"
              className="reset-filters-button"
              onClick={() => {
                navegar({ busqueda: "", filtro: "TODOS", pagina: 1 });
              }}
            >
              Restablecer filtros
            </button>
          ) : null}
        </div>
      ) : (
        <section className="recording-library" aria-label="Archivos agrupados por reunión">
          <div className="recording-library-heading">
            <h2>Encuentros con archivos</h2>
            <span>
              {totalEncuentros} {totalEncuentros === 1 ? "encuentro" : "encuentros"}
            </span>
          </div>

          {gruposPagina.map((grupo) => {
            const fecha = typeof grupo.fechaInicio === "string" ? new Date(grupo.fechaInicio) : grupo.fechaInicio;
            const orderedArtifacts = [...grupo.archivos].sort(
              (a, b) => artifactSortOrder(a.tipo) - artifactSortOrder(b.tipo)
            );

            return (
              <article className="recording-meeting-card" key={grupo.instanciaId}>
                <header className="recording-meeting-header">
                  <div className="recording-meeting-date">
                    <span>{formatDateTime(fecha)}</span>
                    <strong>
                      {grupo.archivos.length} {grupo.archivos.length === 1 ? "archivo" : "archivos"}
                    </strong>
                  </div>

                  <div className="recording-meeting-title">
                    <p>{grupo.programa}</p>
                    <h2>{grupo.titulo}</h2>
                    <small>{grupo.docente}</small>

                    {grupo.estadoGrabacion === "PROCESANDO" ? (
                      <span className="recordings-status-badge is-processing">
                        <Clock size={13} aria-hidden="true" />
                        Video procesando en Google Meet (demora habitual: 15-45 min)
                      </span>
                    ) : null}
                  </div>

                  <div className="recording-meeting-folder">
                    {grupo.folderId ? (
                      <a
                        className="secondary-action"
                        href={driveFolderUrl(grupo.folderId)}
                        target="_blank"
                        rel="noreferrer"
                      >
                        <FolderOpen size={16} />
                        Carpeta en Drive
                        <ExternalLink size={13} />
                      </a>
                    ) : (
                      <span className="muted-text">Carpeta no disponible</span>
                    )}
                  </div>
                </header>

                <div className="recording-file-grid">
                  {orderedArtifacts.map((archivo) => (
                    <article
                      className={`recording-file-card ${artifactToneClass(archivo.tipo)}`}
                      key={archivo.id}
                    >
                      <div className="recording-file-icon" aria-hidden="true">
                        {artifactTypeIcon(archivo.tipo, 20)}
                      </div>

                      <div className="recording-file-copy">
                        <div className="recording-file-label">
                          <strong>{etiquetaTipoArtefactoMeet(archivo.tipo)}</strong>
                          <span>{artifactDetail(archivo.mimeType, archivo.tamanoBytes)}</span>
                        </div>
                        <p title={archivo.nombre ?? ""}>{archivo.nombre}</p>
                      </div>

                      <div className="recording-file-action">
                        <a
                          className={`recording-file-open ${
                            archivo.tipo === "GRABACION" ? "is-primary" : ""
                          }`.trim()}
                          href={archivo.webViewUrl ?? driveFileUrl(archivo.id)}
                          target="_blank"
                          rel="noreferrer"
                        >
                          <ExternalLink size={15} />
                          {actionButtonText(archivo.tipo, archivo.mimeType)}
                        </a>
                      </div>
                    </article>
                  ))}
                </div>
              </article>
            );
          })}
          {totalPaginas > 1 ? (
            <nav aria-label="Paginación de encuentros" style={{ display: "flex", alignItems: "center", justifyContent: "center", gap: "1rem", margin: "1.5rem 0" }}>
              <button className="secondary-action" type="button" disabled={paginaVisible === 1} onClick={() => navegar({ pagina: paginaVisible - 1 })}>Anterior</button>
              <span aria-live="polite">Página {paginaVisible} de {totalPaginas}</span>
              <button className="secondary-action" type="button" disabled={paginaVisible === totalPaginas} onClick={() => navegar({ pagina: paginaVisible + 1 })}>Siguiente</button>
            </nav>
          ) : null}
        </section>
      )}
    </div>
  );
}

function artifactTypeIcon(tipo: TipoArtefactoMeet, size = 14) {
  if (tipo === "GRABACION") return <Video size={size} aria-hidden="true" />;
  if (tipo === "TRANSCRIPCION") return <FileText size={size} aria-hidden="true" />;
  if (tipo === "LISTA_ASISTENCIA") return <FileSpreadsheet size={size} aria-hidden="true" />;
  if (tipo === "NOTAS") return <NotebookText size={size} aria-hidden="true" />;
  return <FileText size={size} aria-hidden="true" />;
}

function artifactToneClass(tipo: TipoArtefactoMeet): string {
  if (tipo === "GRABACION") return "is-recording";
  if (tipo === "TRANSCRIPCION") return "is-transcript";
  if (tipo === "LISTA_ASISTENCIA") return "is-attendance";
  if (tipo === "NOTAS") return "is-notes";
  return "";
}

function artifactSortOrder(tipo: TipoArtefactoMeet): number {
  if (tipo === "GRABACION") return 0;
  if (tipo === "TRANSCRIPCION") return 1;
  if (tipo === "LISTA_ASISTENCIA") return 2;
  if (tipo === "NOTAS") return 3;
  return 4;
}

function actionButtonText(tipo: TipoArtefactoMeet, mimeType?: string | null): string {
  if (tipo === "GRABACION") return "Reproducir grabación";
  if (tipo === "LISTA_ASISTENCIA") return mimeType === "application/vnd.google-apps.spreadsheet" ? "Abrir planilla de asistencia" : "Ver asistencia";
  if (tipo === "TRANSCRIPCION") return "Ver transcripción";
  if (tipo === "NOTAS") return "Ver notas";
  return "Abrir documento";
}

function artifactDetail(
  mimeType?: string | null,
  bytes?: bigint | number | null
): string {
  if (mimeType === "application/vnd.google-apps.document") return "Documento de Google";
  if (mimeType === "application/vnd.google-apps.spreadsheet") return "Google Sheets";
  return formatFileSize(bytes);
}

function formatFileSize(bytes?: bigint | number | null): string {
  if (bytes === undefined || bytes === null) return "Tamaño no disponible";
  const numBytes = typeof bytes === "bigint" ? Number(bytes) : bytes;
  const megabytes = numBytes / (1024 * 1024);
  return megabytes >= 1024 ? `${(megabytes / 1024).toFixed(1)} GB` : `${megabytes.toFixed(1)} MB`;
}

function driveFolderUrl(folderId: string): string {
  return `https://drive.google.com/drive/folders/${encodeURIComponent(folderId)}`;
}

function driveFileUrl(fileId: string): string {
  return `https://drive.google.com/open?id=${encodeURIComponent(fileId)}`;
}

