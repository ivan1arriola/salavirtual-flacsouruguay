"use client";

import { Clock, ExternalLink, FileAudio, FileSpreadsheet, FileText, FolderOpen, MessagesSquare, NotebookText, RotateCw, Search, UsersRound, Video, X } from "lucide-react";
import { useState } from "react";
import { useRouter } from "next/navigation";
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
  esAdmin?: boolean;
}>;

type ErrorPlanilla = Readonly<{ eventoProveedorId: string; detalle: string }>;
type FeedbackPlanillas = Readonly<{
  tipo: "ok" | "error";
  mensaje: string;
  reparadas: number;
  fallidas: number;
  revisadas: number;
  errores: readonly ErrorPlanilla[];
  bloqueoGoogle: boolean;
}>;

export function RecordingsLibrary({
  grupos,
  pagina: paginaVisible,
  totalPaginas,
  busqueda,
  filtro,
  conteos,
  totalEncuentros,
  esAdmin = false,
}: RecordingsLibraryProps) {
  const router = useRouter();
  const [busquedaEditada, setBusquedaEditada] = useState(busqueda);
  const [regenerandoId, setRegenerandoId] = useState<string | null>(null);
  const [feedback, setFeedback] = useState<{ id: string; tipo: "ok" | "error"; mensaje: string } | null>(null);
  const [reparandoPlanillasVacias, setReparandoPlanillasVacias] = useState(false);
  const [feedbackPlanillasVacias, setFeedbackPlanillasVacias] = useState<FeedbackPlanillas | null>(null);

  const filteredGrupos = grupos;
  const gruposPagina = grupos;
  const navegar = (cambios: Partial<{ pagina: number; busqueda: string; filtro: TipoFiltroArtefacto }>) => {
    window.location.assign(crearHrefGrabaciones({ pagina: paginaVisible, busqueda, filtro }, cambios));
  };

  async function handleGenerarPlanilla(instanciaId: string) {
    setRegenerandoId(instanciaId);
    setFeedback(null);
    try {
      const response = await fetch(
        `/api/v1/reuniones/instancias/${encodeURIComponent(instanciaId)}/asistencia/regenerar`,
        { method: "POST", cache: "no-store" }
      );
      const data = await response.json();
      if (!response.ok) {
        const detalle = typeof data.detalle === "string" ? data.detalle.trim() : "";
        throw new Error([
          data.error ?? "No se pudo generar la planilla de asistencia.",
          detalle,
        ].filter(Boolean).join(" "));
      }
      setFeedback({
        id: instanciaId,
        tipo: "ok",
        mensaje: "¡Planilla de Google Sheets generada con éxito!",
      });
      setTimeout(() => {
        window.location.reload();
      }, 1200);
    } catch (err) {
      setFeedback({
        id: instanciaId,
        tipo: "error",
        mensaje: err instanceof Error ? err.message : "Error inesperado al generar planilla.",
      });
    } finally {
      setRegenerandoId(null);
    }
  }

  async function handleRepararPlanillasVacias(eventoProveedorIds?: readonly string[]) {
    setReparandoPlanillasVacias(true);
    setFeedbackPlanillasVacias(null);
    try {
      const response = await fetch("/api/v1/asistencia/planillas-vacias", {
        method: "POST",
        cache: "no-store",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(eventoProveedorIds ? { eventoProveedorIds } : {})
      });
      const data = await response.json();
      if (!response.ok) {
        throw new Error(typeof data.error === "string" ? data.error : "No se pudieron revisar las planillas.");
      }
      const errores: ErrorPlanilla[] = Array.isArray(data.errores)
        ? data.errores.filter((item: unknown): item is ErrorPlanilla =>
            Boolean(item) && typeof item === "object" &&
            typeof (item as ErrorPlanilla).eventoProveedorId === "string" &&
            typeof (item as ErrorPlanilla).detalle === "string")
        : [];
      const fallidas = Number(data.fallidas) || 0;
      const reparadas = Number(data.reparadas) || 0;
      const revisadas = Number(data.revisadas) || 0;
      const bloqueoGoogle = errores.some(({ detalle }) =>
        /unauthorized_client|delegation denied|insufficient authentication scopes|insufficient oauth|admin_policy_enforced/i.test(detalle)
      );
      const mensaje = bloqueoGoogle
        ? `Google Workspace no autorizó la revisión de ${fallidas} planilla(s). Revisá la delegación y los permisos OAuth antes de reintentar.`
        : fallidas > 0
          ? `Se repararon ${reparadas} planilla(s); ${fallidas} requieren atención.`
          : reparadas > 0
            ? `Se reconstruyeron ${reparadas} planilla(s) de ${revisadas} revisadas.`
            : `Se revisaron ${revisadas} planilla(s); no se encontraron hojas vacías.`;
      setFeedbackPlanillasVacias({ tipo: fallidas > 0 ? "error" : "ok", mensaje, reparadas, fallidas, revisadas, errores, bloqueoGoogle });
      if (reparadas > 0) router.refresh();
    } catch (error) {
      setFeedbackPlanillasVacias({
        tipo: "error",
        mensaje: error instanceof Error ? error.message : "No se pudieron revisar las planillas.",
        reparadas: 0, fallidas: 0, revisadas: 0, errores: [], bloqueoGoogle: false
      });
    } finally {
      setReparandoPlanillasVacias(false);
    }
  }

  function tienePlanillaSheets(grupo: GrupoEncuentroConArchivos): boolean {
    return grupo.archivos.some(
      (a) => a.tipo === "LISTA_ASISTENCIA" && a.mimeType === "application/vnd.google-apps.spreadsheet"
    );
  }

  return (
    <div className="recordings-library-container">
      <div className="recordings-controls">
        <div className="recordings-search-bar">
          <Search size={18} className="search-icon" aria-hidden="true" />
          <input
            type="search"
            placeholder="Buscar por materia, clase o docente..."
            value={busquedaEditada}
            onChange={(e) => setBusquedaEditada(e.target.value)}
            onKeyDown={(e) => { if (e.key === "Enter") navegar({ busqueda: busquedaEditada, pagina: 1 }); }}
            aria-label="Buscar encuentros o archivos"
          />
          {busquedaEditada ? (
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

        <div className="recordings-filter-tabs" role="group" aria-label="Filtrar por tipo de archivo">
          <button
            type="button"
            aria-pressed={filtro === "TODOS"}
            className={`filter-tab ${filtro === "TODOS" ? "is-active" : ""}`}
            onClick={() => navegar({ filtro: "TODOS", pagina: 1 })}
          >
            Todos <span className="tab-badge">{conteos.todos}</span>
          </button>
          <button
            type="button"
            aria-pressed={filtro === "GRABACIONES"}
            className={`filter-tab ${filtro === "GRABACIONES" ? "is-active" : ""}`}
            onClick={() => navegar({ filtro: "GRABACIONES", pagina: 1 })}
          >
            <Video size={14} aria-hidden="true" />
            Solo grabaciones <span className="tab-badge">{conteos.grabaciones}</span>
          </button>
          <button
            type="button"
            aria-pressed={filtro === "ASISTENCIAS"}
            className={`filter-tab ${filtro === "ASISTENCIAS" ? "is-active" : ""}`}
            onClick={() => navegar({ filtro: "ASISTENCIAS", pagina: 1 })}
          >
            <UsersRound size={14} aria-hidden="true" />
            Solo asistencias <span className="tab-badge">{conteos.asistencias}</span>
          </button>
          <button
            type="button"
            aria-pressed={filtro === "NOTAS_Y_TRANSCRIPCIONES"}
            className={`filter-tab ${filtro === "NOTAS_Y_TRANSCRIPCIONES" ? "is-active" : ""}`}
            onClick={() => navegar({ filtro: "NOTAS_Y_TRANSCRIPCIONES", pagina: 1 })}
          >
            <NotebookText size={14} aria-hidden="true" />
            Notas y transcripciones <span className="tab-badge">{conteos.notas}</span>
          </button>
        </div>
        {esAdmin ? (
          <div className="recordings-bulk-repair">
            <button
              type="button"
              className="secondary-action recordings-bulk-repair-button"
              disabled={reparandoPlanillasVacias}
              aria-busy={reparandoPlanillasVacias}
              onClick={() => void handleRepararPlanillasVacias()}
              title="Revisar todas las planillas de asistencia registradas y reconstruir las que estén vacías con datos de Google Meet y Workspace"
            >
              <FileSpreadsheet size={16} aria-hidden="true" />
              {reparandoPlanillasVacias ? "Revisando y reparando…" : "Reparar planillas vacías"}
            </button>
            {feedbackPlanillasVacias ? (
              <div
                role="status"
                aria-live="polite"
                className={`recordings-bulk-repair-feedback ${feedbackPlanillasVacias.tipo === "error" ? "is-error" : "is-success"}`}
              >
                <p>{feedbackPlanillasVacias.mensaje}</p>
                {feedbackPlanillasVacias.bloqueoGoogle ? (
                  <a className="recordings-repair-settings-link" href="/configuracion">
                    Revisar permisos de Google Workspace
                  </a>
                ) : null}
                {feedbackPlanillasVacias.errores.length > 0 ? (
                  <>
                    <details className="recordings-repair-details">
                      <summary>Ver detalles técnicos por encuentro ({feedbackPlanillasVacias.errores.length})</summary>
                      <ul>
                        {feedbackPlanillasVacias.errores.map((error, index) => (
                          <li key={`${error.eventoProveedorId}-${index}`}>
                            <strong>{error.eventoProveedorId}</strong>: {error.detalle}
                          </li>
                        ))}
                      </ul>
                    </details>
                    <button
                      type="button"
                      className="secondary-action recordings-retry-button"
                      disabled={reparandoPlanillasVacias}
                      onClick={() => void handleRepararPlanillasVacias(
                        [...new Set(feedbackPlanillasVacias.errores.map((item) => item.eventoProveedorId))]
                      )}
                    >
                      <RotateCw size={14} aria-hidden="true" />
                      Reintentar solo las fallidas
                    </button>
                  </>
                ) : null}
              </div>
            ) : null}
          </div>
        ) : null}
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
              (a, b) => artifactSortOrder(a.tipo, a.etiquetaZoom, a.secundarioZoom) - artifactSortOrder(b.tipo, b.etiquetaZoom, b.secundarioZoom)
            );
            const grabacionPendiente = !grupo.archivos.some((a) => a.tipo === "GRABACION") &&
              (grupo.estadoGrabacion === "EN_CURSO" || grupo.estadoGrabacion === "PROCESANDO");

            const colapsarSecundarios = grupo.proveedor === "ZOOM" && orderedArtifacts.length > 6;
            const principales = colapsarSecundarios
              ? orderedArtifacts.filter((a) => !a.secundarioZoom || a.pendienteZoom)
              : orderedArtifacts;
            const secundarios = colapsarSecundarios && principales.length > 0
              ? orderedArtifacts.filter((a) => a.secundarioZoom && !a.pendienteZoom)
              : [];

            const renderArchivo = (archivo: (typeof orderedArtifacts)[number]) => (
              <article
                className={`recording-file-card ${artifactToneClass(archivo.tipo, archivo.etiquetaZoom)}`}
                key={archivo.id}
              >
                <div className="recording-file-icon" aria-hidden="true">
                  {zoomCategoryIcon(archivo.etiquetaZoom) ?? artifactTypeIcon(archivo.tipo, 20)}
                </div>

                <div className="recording-file-copy">
                  <div className="recording-file-label">
                    <strong>{archivo.etiquetaZoom ?? etiquetaTipoArtefactoMeet(archivo.tipo)}</strong>
                    <span>{artifactDetail(archivo.mimeType, archivo.tamanoBytes)}</span>
                  </div>
                  {archivo.descripcionZoom ? (
                    <span className="recording-file-variant">{archivo.descripcionZoom}</span>
                  ) : null}
                  <p title={archivo.nombre ?? ""}>{archivo.nombre}</p>
                </div>

                <div className="recording-file-action" style={{ display: "flex", gap: "6px", alignItems: "center", flexWrap: "wrap" }}>
                  {archivo.pendienteZoom ? (
                    <span className="recording-file-pending">
                      <Clock size={14} aria-hidden="true" />
                      {archivo.estadoZoomEtiqueta ?? "Pendiente"}
                      {archivo.errorCodigo ? ` (${archivo.errorCodigo})` : ""}
                    </span>
                  ) : (
                    <a
                      className={`recording-file-open ${
                        archivo.tipo === "GRABACION" ? "is-primary" : ""
                      }`.trim()}
                      href={archivo.webViewUrl ?? driveFileUrl(archivo.id)}
                      target="_blank"
                      rel="noreferrer"
                    >
                      <ExternalLink size={15} />
                      {actionButtonText(archivo.tipo, archivo.mimeType, archivo.etiquetaZoom)}
                    </a>
                  )}
                  {esAdmin && grupo.proveedor !== "ZOOM" && archivo.tipo === "LISTA_ASISTENCIA" && archivo.mimeType !== "application/vnd.google-apps.spreadsheet" ? (
                    <button
                      type="button"
                      className="recording-file-open recording-file-convert-btn"
                      disabled={regenerandoId === grupo.instanciaId}
                      onClick={() => handleGenerarPlanilla(grupo.instanciaId)}
                      title="Convertir esta asistencia a la nueva planilla de Google Sheets"
                    >
                      <FileSpreadsheet size={14} />
                      {regenerandoId === grupo.instanciaId ? "Generando…" : "Pasar a Sheets"}
                    </button>
                  ) : null}
                </div>
              </article>
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
                    <p>
                      {grupo.programa}
                      <span className={`recordings-provider-badge ${grupo.proveedor === "ZOOM" ? "is-zoom" : "is-meet"}`}>
                        {grupo.proveedor === "ZOOM" ? "Zoom" : "Google Meet"}
                      </span>
                    </p>
                    <h2>{grupo.titulo}</h2>
                    <small>{grupo.docente}</small>

                    {grabacionPendiente ? (
                      <span className={`recordings-status-badge ${grupo.estadoGrabacion === "EN_CURSO" ? "is-live" : "is-processing"}`}>
                        <Clock size={13} aria-hidden="true" />
                        {grupo.estadoGrabacion === "EN_CURSO" ? "Grabación en curso" : "Video procesando en Google Meet"}
                      </span>
                    ) : null}
                  </div>

                  <div className="recording-meeting-folder" style={{ display: "flex", gap: "8px", alignItems: "center", flexWrap: "wrap" }}>
                    {esAdmin && grupo.proveedor !== "ZOOM" ? (
                      <button
                        type="button"
                        className="secondary-action recording-regenerate-btn"
                        disabled={regenerandoId === grupo.instanciaId}
                        onClick={() => handleGenerarPlanilla(grupo.instanciaId)}
                        title="Generar o actualizar planilla en Google Sheets con datos auditados de Meet"
                      >
                        <FileSpreadsheet size={15} />
                        {regenerandoId === grupo.instanciaId
                          ? "Generando planilla…"
                          : tienePlanillaSheets(grupo)
                            ? "Regenerar planilla Sheets"
                            : "Generar planilla Sheets"}
                      </button>
                    ) : null}

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

                {feedback?.id === grupo.instanciaId ? (
                  <div
                    role="alert"
                    className={`recording-feedback-banner ${feedback.tipo === "ok" ? "is-success" : "is-error"}`}
                  >
                    {feedback.mensaje}
                  </div>
                ) : null}

                <div className="recording-file-grid">
                  {grabacionPendiente ? (
                    <article className="recording-file-card is-recording is-placeholder" aria-label={grupo.estadoGrabacion === "EN_CURSO" ? "Grabación en curso" : "Grabación en procesamiento"}>
                      <div className="recording-file-icon" aria-hidden="true"><Video size={20} /></div>
                      <div className="recording-file-copy">
                        <div className="recording-file-label"><strong>Grabación</strong><span>Google Meet</span></div>
                        <p>{grupo.estadoGrabacion === "EN_CURSO" ? "La grabación está en curso. El video aparecerá aquí cuando Google Meet lo publique." : "Google Meet está procesando el video. Aparecerá aquí cuando esté disponible."}</p>
                      </div>
                      <div className="recording-file-action"><span className="recording-file-pending"><Clock size={14} aria-hidden="true" /> Grabación pendiente</span></div>
                    </article>
                  ) : null}
                  {grupo.asistenciaHref ? (
                    <article className="recording-file-card is-attendance" key="asistencia-zoom">
                      <div className="recording-file-icon" aria-hidden="true"><UsersRound size={20} /></div>
                      <div className="recording-file-copy">
                        <div className="recording-file-label">
                          <strong>Asistencia</strong>
                          <span>Registro de Zoom</span>
                        </div>
                        <p>Participantes, minutos y conciliación del encuentro.</p>
                      </div>
                      <div className="recording-file-action">
                        <a className="recording-file-open" href={grupo.asistenciaHref}>
                          <UsersRound size={15} />
                          Ver asistencia
                        </a>
                      </div>
                    </article>
                  ) : null}
                  {principales.map(renderArchivo)}
                </div>

                {secundarios.length > 0 ? (
                  <details className="recording-extra-files">
                    <summary className="recording-extra-summary">
                      <span>
                        Pistas de audio individuales y archivos auxiliares ({secundarios.length})
                      </span>
                    </summary>
                    <div className="recording-file-grid is-nested">
                      {secundarios.map(renderArchivo)}
                    </div>
                  </details>
                ) : null}
              </article>
            );
          })}
          {totalPaginas > 1 ? (
            <nav className="recordings-pagination" aria-label="Paginación de encuentros">
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

function zoomCategoryIcon(etiquetaZoom: string | undefined, size = 20) {
  if (etiquetaZoom === "Audio") return <FileAudio size={size} aria-hidden="true" />;
  if (etiquetaZoom === "Chat") return <MessagesSquare size={size} aria-hidden="true" />;
  return null;
}

function artifactTypeIcon(tipo: TipoArtefactoMeet, size = 14) {
  if (tipo === "GRABACION") return <Video size={size} aria-hidden="true" />;
  if (tipo === "TRANSCRIPCION") return <FileText size={size} aria-hidden="true" />;
  if (tipo === "LISTA_ASISTENCIA") return <FileSpreadsheet size={size} aria-hidden="true" />;
  if (tipo === "NOTAS") return <NotebookText size={size} aria-hidden="true" />;
  return <FileText size={size} aria-hidden="true" />;
}

function artifactToneClass(tipo: TipoArtefactoMeet, etiquetaZoom?: string): string {
  if (tipo === "GRABACION") return "is-recording";
  if (tipo === "TRANSCRIPCION") return "is-transcript";
  if (tipo === "LISTA_ASISTENCIA") return "is-attendance";
  if (tipo === "NOTAS") return "is-notes";
  if (etiquetaZoom === "Audio") return "is-audio";
  if (etiquetaZoom === "Chat") return "is-chat";
  return "";
}

function artifactSortOrder(tipo: TipoArtefactoMeet, etiquetaZoom?: string, secundarioZoom?: boolean): number {
  if (tipo === "GRABACION") return 0;
  if (tipo === "TRANSCRIPCION") return 1;
  if (tipo === "LISTA_ASISTENCIA") return 2;
  if (tipo === "NOTAS") return 3;
  if (etiquetaZoom === "Chat") return 4;
  if (etiquetaZoom === "Audio" && !secundarioZoom) return 5;
  if (secundarioZoom) return 7;
  return 6;
}

function actionButtonText(tipo: TipoArtefactoMeet, mimeType?: string | null, etiquetaZoom?: string): string {
  if (tipo === "GRABACION") return "Reproducir grabación";
  if (tipo === "LISTA_ASISTENCIA") return mimeType === "application/vnd.google-apps.spreadsheet" ? "Abrir planilla de asistencia" : "Ver asistencia";
  if (tipo === "TRANSCRIPCION") return "Ver transcripción";
  if (tipo === "NOTAS") return "Ver notas";
  if (etiquetaZoom === "Audio") return "Escuchar audio";
  if (etiquetaZoom === "Chat") return "Ver chat";
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

