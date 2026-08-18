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
  listarGrabacionesPendientesVisibles
} from "@/src/modules/meet/grabaciones.adapter";
import { puedeSincronizarGrabaciones } from "@/src/modules/meet/grabaciones.domain";
import { etiquetaTipoArtefactoMeet, type TipoArtefactoMeet } from "@/src/modules/meet/meet-artifacts.domain";

export default async function GrabacionesPage() {
  const session = await auth();
  if (!session?.user) redirect("/acceso");
  const actor = await resolveSessionActor(db, { id: session.user.id, email: session.user.email });
  if (!actor?.activo) redirect("/acceso");
  const canSynchronize = puedeSincronizarGrabaciones(actor.rol);
  const now = new Date();
  const since = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);
  const [artifacts, pendingRecordings, finishedMeet, workspaceConfiguration] = await Promise.all([
    listarArchivosMeetVisibles(db, actor),
    listarGrabacionesPendientesVisibles(db, actor, since, now),
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
    pendientes: pendingRecordings.length
  };

  return (
    <>
      <header className="page-header">
        <div>
          <p className="page-eyebrow">Google Meet</p>
          <h1>Grabaciones y archivos</h1>
          <p>
            {artifacts.length} archivos disponibles · {counts.grabaciones} grabaciones · {counts.transcripciones} transcripciones · {counts.asistencias} listas de asistencia · {counts.notas} notas · {counts.pendientes} grabaciones pendientes.
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

      {canSynchronize ? (
        <section className="content-section">
          <MeetArtifactsButton count={finishedMeet} />
        </section>
      ) : null}

      {pendingRecordings.length > 0 ? (
        <section className="content-section">
          <div className="section-heading">
            <div>
              <h2>Grabaciones pendientes</h2>
              <p>Encuentros que debían grabarse pero cuyo archivo todavía no fue generado por Google Meet.</p>
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
                        <strong>Google Meet todavía no generó el archivo.</strong>
                        <small>
                          {event.errorArchivos
                            ? `La última revisión tuvo una incidencia: ${event.errorArchivos}`
                            : event.conferenceRecordName
                              ? "La conferencia ya fue detectada y seguirá revisándose automáticamente."
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

      <section className="content-section">
        {artifacts.length === 0 ? (
          <div className="empty-state"><Video size={24} /><p>Todavía no hay archivos de Meet disponibles.</p></div>
        ) : (
          <div className="table-wrap">
            <table className="data-table">
              <thead><tr><th>Fecha</th><th>Reunión</th><th>Programa</th><th>Tipo</th><th>Archivo</th><th>Carpeta</th><th>Abrir</th></tr></thead>
              <tbody>
                {artifacts.map((artifact) => {
                  const meeting = artifact.eventoProveedor.instancia;
                  const association = meeting.solicitud.docentePrograma;
                  return (
                    <tr key={artifact.id}>
                      <td className="date-cell">{formatDateTime(meeting.inicioProgramadoAt)}</td>
                      <td><strong>{meeting.solicitud.titulo}</strong><small>{association.docente.usuario.nombres} {association.docente.usuario.apellidos}</small></td>
                      <td>{association.programa.nombre}</td>
                      <td><span className="status status-neutral">{artifactTypeIcon(artifact.tipo)}{etiquetaTipoArtefactoMeet(artifact.tipo)}</span></td>
                      <td><strong>{artifact.nombre}</strong><small>{artifactDetail(artifact.mimeType, artifact.tamanoBytes)}</small></td>
                      <td>
                        {artifact.eventoProveedor.driveFolderId ? (
                          <a
                            className="text-link recording-folder-link"
                            href={driveFolderUrl(artifact.eventoProveedor.driveFolderId)}
                            target="_blank"
                            rel="noreferrer"
                          >
                            <FolderOpen size={16} />Abrir carpeta<ExternalLink size={13} />
                          </a>
                        ) : <span className="muted-text">No disponible</span>}
                      </td>
                      <td>
                        {artifact.tipo === "GRABACION" ? (
                          <Link className="icon-link" href={`/grabaciones/${artifact.id}`} title="Reproducir grabación">
                            <Play size={17} fill="currentColor" /><span className="sr-only">Reproducir grabación</span>
                          </Link>
                        ) : (
                          <a
                            className="icon-link"
                            href={artifact.webViewUrl ?? driveFileUrl(artifact.driveFileId)}
                            target="_blank"
                            rel="noreferrer"
                            title={`Abrir ${etiquetaTipoArtefactoMeet(artifact.tipo).toLowerCase()}`}
                          >
                            <ExternalLink size={17} /><span className="sr-only">Abrir archivo</span>
                          </a>
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </section>
    </>
  );
}

function artifactTypeIcon(tipo: TipoArtefactoMeet) {
  if (tipo === "GRABACION") return <Video size={14} aria-hidden="true" />;
  if (tipo === "TRANSCRIPCION") return <FileText size={14} aria-hidden="true" />;
  if (tipo === "LISTA_ASISTENCIA") return <UsersRound size={14} aria-hidden="true" />;
  if (tipo === "NOTAS") return <NotebookText size={14} aria-hidden="true" />;
  return <FileText size={14} aria-hidden="true" />;
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
