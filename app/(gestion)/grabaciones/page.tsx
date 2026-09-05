import { AlertTriangle, ExternalLink, FileText, FolderOpen, NotebookText, Play, UsersRound, Video } from "lucide-react";
import Link from "next/link";
import { redirect } from "next/navigation";
import { auth } from "@/auth";
import { MeetArtifactsButton } from "@/src/components/meet-artifacts-button";
import { resolveSessionActor } from "@/src/lib/auth/session-actor.adapter";
import { db } from "@/src/lib/db";
import { formatDateTime } from "@/src/lib/ui/format";
import {
  listarArchivosMeetVisibles,
  listarGrabacionesNoRealizadasVisibles,
  listarGrabacionesPendientesVisibles
} from "@/src/modules/meet/grabaciones.adapter";
import { puedeSincronizarGrabaciones } from "@/src/modules/meet/grabaciones.domain";
import { etiquetaTipoArtefactoMeet, type TipoArtefactoMeet } from "@/src/modules/meet/meet-artifacts.domain";
import "./grabaciones.css";

export default async function GrabacionesPage() {
  const session = await auth();
  if (!session?.user) redirect("/acceso");
  const actor = await resolveSessionActor(db, { id: session.user.id, email: session.user.email });
  if (!actor?.activo) redirect("/acceso");
  const canSynchronize = puedeSincronizarGrabaciones(actor.rol);
  const now = new Date();
  const since = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);
  const [artifacts, pendingRecordings, missingRecordings, finishedMeet, workspaceConfiguration] = await Promise.all([
    listarArchivosMeetVisibles(db, actor),
    listarGrabacionesPendientesVisibles(db, actor, since, now),
    listarGrabacionesNoRealizadasVisibles(db, actor, since, now),
    canSynchronize
      ? db.eventoProveedor.count({
          where: {
            proveedor: { tipo: "GOOGLE_MEET" },
            codigoReunion: { not: null },
            instancia: {
              finProgramadoAt: { gte: since, lte: now },
              estado: { not: "CANCELADA" }
            }
          }
        })
      : Promise.resolve(0),
    db.configuracionGoogleWorkspace.findUnique({
      where: { id: "principal" },
      select: { activa: true, driveDestinationId: true }
    })
  ]);
  const generalFolderId = workspaceConfiguration?.activa
    ? workspaceConfiguration.driveDestinationId
    : null;
  const counts = {
    grabaciones: artifacts.filter(({ tipo }) => tipo === "GRABACION").length,
    transcripciones: artifacts.filter(({ tipo }) => tipo === "TRANSCRIPCION").length,
    asistencias: artifacts.filter(({ tipo }) => tipo === "LISTA_ASISTENCIA").length,
    notas: artifacts.filter(({ tipo }) => tipo === "NOTAS").length,
    pendientes: pendingRecordings.length,
    noGrabadas: missingRecordings.length
  };
  const artifactGroups = artifacts.reduce<Array<{ instanciaId: string; artifacts: typeof artifacts }>>(
    (groups, artifact) => {
      const instanciaId = artifact.eventoProveedor.instancia.id;
      const existing = groups.find((group) => group.instanciaId === instanciaId);
      if (existing) {
        existing.artifacts.push(artifact);
      } else {
        groups.push({ instanciaId, artifacts: [artifact] });
      }
      return groups;
    },
    []
  );

  return (
    <div className="recordings-page">
      <header className="page-header recordings-header">
        <div>
          <p className="page-eyebrow">Google Meet</p>
          <h1>Grabaciones y archivos</h1>
          <p>
            {artifacts.length} {artifacts.length === 1 ? "archivo disponible" : "archivos disponibles"} en {artifactGroups.length} {artifactGroups.length === 1 ? "reunión" : "reuniones"}.
          </p>
        </div>
        {generalFolderId ? (
          <a
            className="primary-action"
            href={driveFolderUrl(generalFolderId)}
            target="_blank"
            rel="noreferrer"
          >
            <FolderOpen size={18} />Carpeta general
          </a>
        ) : <Video size={28} color="var(--brand)" aria-hidden="true" />}
      </header>

      {artifacts.length > 0 ? (
        <section className="recordings-summary" aria-label="Resumen de archivos disponibles">
          <div><Video size={18} /><span><strong>{counts.grabaciones}</strong>Grabaciones</span></div>
          <div><FileText size={18} /><span><strong>{counts.transcripciones}</strong>Transcripciones</span></div>
          <div><UsersRound size={18} /><span><strong>{counts.asistencias}</strong>Asistencias</span></div>
          <div><NotebookText size={18} /><span><strong>{counts.notas}</strong>Notas</span></div>
        </section>
      ) : null}

      {canSynchronize ? (
        <section className="content-section recordings-sync-section">
          <MeetArtifactsButton count={finishedMeet} />
        </section>
      ) : null}

      {pendingRecordings.length > 0 ? (
        <section className="content-section">
          <div className="section-heading">
            <div>
              <h2>Grabaciones pendientes</h2>
              <p>Encuentros que debían grabarse y todavía tienen archivos pendientes de Google Meet.</p>
            </div>
          </div>
          <div className="table-wrap">
            <table className="data-table">
              <thead><tr><th>Fecha</th><th>Reunión</th><th>Programa</th><th>Estado</th><th>Detalle</th><th>Carpeta</th></tr></thead>
              <tbody>
                {pendingRecordings.map((event) => {
                  const meeting = event.instancia;
                  const association = meeting.solicitud.docentePrograma;
                  return (
                    <tr key={event.id}>
                      <td className="date-cell">{formatDateTime(meeting.inicioProgramadoAt)}</td>
                      <td><strong>{meeting.solicitud.titulo}</strong><small>{association.docente.usuario.nombres} {association.docente.usuario.apellidos}</small></td>
                      <td>{association.programa.nombre}</td>
                      <td><span className="status status-warning"><Video size={14} aria-hidden="true" />Grabación pendiente</span></td>
                      <td>
                        <strong>La grabación todavía no está disponible.</strong>
                        <small>
                          {event.errorArchivos
                            ? `La última revisión tuvo una incidencia: ${event.errorArchivos}`
                            : event.conferenceRecordName
                              ? "La conferencia ya fue detectada y se seguirá revisando hasta que Google termine de procesar sus archivos."
                              : "Todavía se está esperando el registro finalizado de la conferencia."}
                        </small>
                      </td>
                      <td>
                        {event.driveFolderId ? (
                          <a
                            className="text-link recording-folder-link"
                            href={driveFolderUrl(event.driveFolderId)}
                            target="_blank"
                            rel="noreferrer"
                          >
                            <FolderOpen size={16} />Abrir carpeta<ExternalLink size={13} />
                          </a>
                        ) : event.errorArchivos ? (
                          <span className="status status-error"><AlertTriangle size={14} aria-hidden="true" />Revisión con error</span>
                        ) : <span className="muted-text">Carpeta pendiente</span>}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </section>
      ) : null}

      {missingRecordings.length > 0 ? (
        <section className="content-section">
          <div className="section-heading">
            <div>
              <h2>Reuniones que no se grabaron</h2>
              <p>Google Meet terminó de procesar la conferencia sin registrar ninguna sesión de grabación.</p>
            </div>
          </div>
          <div className="table-wrap">
            <table className="data-table">
              <thead><tr><th>Fecha</th><th>Reunión</th><th>Programa</th><th>Estado</th><th>Detalle</th><th>Carpeta</th></tr></thead>
              <tbody>
                {missingRecordings.map((event) => {
                  const meeting = event.instancia;
                  const association = meeting.solicitud.docentePrograma;
                  return (
                    <tr key={event.id}>
                      <td className="date-cell">{formatDateTime(meeting.inicioProgramadoAt)}</td>
                      <td><strong>{meeting.solicitud.titulo}</strong><small>{association.docente.usuario.nombres} {association.docente.usuario.apellidos}</small></td>
                      <td>{association.programa.nombre}</td>
                      <td><span className="status status-error"><AlertTriangle size={14} aria-hidden="true" />No se grabó</span></td>
                      <td>
                        <strong>No hubo una sesión de grabación en Meet.</strong>
                        <small>La reunión requería grabación, pero Google no registró que el host, un cohost u otro participante autorizado iniciara una.</small>
                      </td>
                      <td>
                        {event.driveFolderId ? (
                          <a
                            className="text-link recording-folder-link"
                            href={driveFolderUrl(event.driveFolderId)}
                            target="_blank"
                            rel="noreferrer"
                          >
                            <FolderOpen size={16} />Abrir carpeta<ExternalLink size={13} />
                          </a>
                        ) : <span className="muted-text">Sin carpeta</span>}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </section>
      ) : null}

      {artifacts.length === 0 ? (
        <section className="content-section">
          <div className="empty-state"><Video size={24} /><p>Todavía no hay archivos de Meet disponibles.</p></div>
        </section>
      ) : (
        <section className="recording-library" aria-label="Archivos agrupados por reunión">
          {artifactGroups.map((group) => {
            const firstArtifact = group.artifacts[0];
            const meeting = firstArtifact.eventoProveedor.instancia;
            const association = meeting.solicitud.docentePrograma;
            const folderId = group.artifacts.find(({ eventoProveedor }) => eventoProveedor.driveFolderId)?.eventoProveedor.driveFolderId ?? null;
            const orderedArtifacts = [...group.artifacts].sort(
              (left, right) => artifactSortOrder(left.tipo) - artifactSortOrder(right.tipo)
            );

            return (
              <article className="recording-meeting-card" key={group.instanciaId}>
                <header className="recording-meeting-header">
                  <div className="recording-meeting-date">
                    <span>{formatDateTime(meeting.inicioProgramadoAt)}</span>
                    <strong>{group.artifacts.length} {group.artifacts.length === 1 ? "archivo" : "archivos"}</strong>
                  </div>
                  <div className="recording-meeting-title">
                    <p>{association.programa.nombre}</p>
                    <h2>{meeting.solicitud.titulo}</h2>
                    <small>{association.docente.usuario.nombres} {association.docente.usuario.apellidos}</small>
                  </div>
                  <div className="recording-meeting-folder">
                    {folderId ? (
                      <a
                        className="secondary-action"
                        href={driveFolderUrl(folderId)}
                        target="_blank"
                        rel="noreferrer"
                      >
                        <FolderOpen size={16} />Carpeta de la reunión<ExternalLink size={13} />
                      </a>
                    ) : <span className="muted-text">Carpeta no disponible</span>}
                  </div>
                </header>

                <div className="recording-file-grid">
                  {orderedArtifacts.map((artifact) => (
                    <article className={`recording-file-card ${artifactToneClass(artifact.tipo)}`} key={artifact.id}>
                      <div className="recording-file-icon" aria-hidden="true">
                        {artifactTypeIcon(artifact.tipo, 20)}
                      </div>
                      <div className="recording-file-copy">
                        <div className="recording-file-label">
                          <strong>{etiquetaTipoArtefactoMeet(artifact.tipo)}</strong>
                          <span>{artifactDetail(artifact.mimeType, artifact.tamanoBytes)}</span>
                        </div>
                        <p title={artifact.nombre}>{artifact.nombre}</p>
                      </div>
                      <div className="recording-file-action">
                        {artifact.tipo === "GRABACION" ? (
                          <Link className="recording-file-open is-primary" href={`/grabaciones/${artifact.id}`}>
                            <Play size={16} fill="currentColor" />Reproducir
                          </Link>
                        ) : (
                          <a
                            className="recording-file-open"
                            href={artifact.webViewUrl ?? driveFileUrl(artifact.driveFileId)}
                            target="_blank"
                            rel="noreferrer"
                          >
                            <ExternalLink size={16} />Abrir archivo
                          </a>
                        )}
                      </div>
                    </article>
                  ))}
                </div>
              </article>
            );
          })}
        </section>
      )}
    </div>
  );
}

function artifactTypeIcon(tipo: TipoArtefactoMeet, size = 14) {
  if (tipo === "GRABACION") return <Video size={size} aria-hidden="true" />;
  if (tipo === "TRANSCRIPCION") return <FileText size={size} aria-hidden="true" />;
  if (tipo === "LISTA_ASISTENCIA") return <UsersRound size={size} aria-hidden="true" />;
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

function artifactDetail(mimeType: string | null, bytes: bigint | null): string {
  if (mimeType === "application/vnd.google-apps.document") return "Documento de Google";
  return formatFileSize(bytes);
}

function formatFileSize(bytes: bigint | null): string {
  if (bytes === null) return "Tamaño no disponible";
  const megabytes = Number(bytes) / (1024 * 1024);
  return megabytes >= 1024
    ? `${(megabytes / 1024).toFixed(1)} GB`
    : `${megabytes.toFixed(1)} MB`;
}

function driveFolderUrl(folderId: string): string {
  return `https://drive.google.com/drive/folders/${encodeURIComponent(folderId)}`;
}

function driveFileUrl(fileId: string): string {
  return `https://drive.google.com/open?id=${encodeURIComponent(fileId)}`;
}
