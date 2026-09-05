import { AlertTriangle, ChevronDown, ExternalLink, FileText, FolderOpen, NotebookText, UsersRound, Video } from "lucide-react";
import type { ReactNode } from "react";
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
    notas: artifacts.filter(({ tipo }) => tipo === "NOTAS").length
  };
  const artifactGroups = artifacts.reduce<Array<{ instanciaId: string; artifacts: typeof artifacts }>>(
    (groups, artifact) => {
      const instanciaId = artifact.eventoProveedor.instancia.id;
      const existing = groups.find((group) => group.instanciaId === instanciaId);
      if (existing) existing.artifacts.push(artifact);
      else groups.push({ instanciaId, artifacts: [artifact] });
      return groups;
    },
    []
  );

  const pendingByMeeting = groupRecordingEventsByMeeting(pendingRecordings);
  const missingByMeeting = groupRecordingEventsByMeeting(missingRecordings);
  const missingMeetingIds = new Set(missingByMeeting.map((group) => group.instanciaId));
  const incidentGroups = [
    ...missingByMeeting.map((group) => ({ ...group, kind: "missing" as const })),
    ...pendingByMeeting
      .filter((group) => !missingMeetingIds.has(group.instanciaId))
      .map((group) => ({ ...group, kind: "pending" as const }))
  ].sort(
    (left, right) =>
      right.events[0].instancia.inicioProgramadoAt.getTime() - left.events[0].instancia.inicioProgramadoAt.getTime()
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
          <a className="primary-action" href={driveFolderUrl(generalFolderId)} target="_blank" rel="noreferrer">
            <FolderOpen size={18} />Carpeta general
          </a>
        ) : <Video size={28} color="var(--brand)" aria-hidden="true" />}
      </header>

      <section className="recordings-toolbar" aria-label="Resumen de archivos y acciones">
        <div className="recordings-summary-compact">
          <SummaryPill icon={<Video size={15} />} count={counts.grabaciones} label="Grabaciones" />
          <SummaryPill icon={<FileText size={15} />} count={counts.transcripciones} label="Transcripciones" />
          <SummaryPill icon={<UsersRound size={15} />} count={counts.asistencias} label="Asistencias" />
          <SummaryPill icon={<NotebookText size={15} />} count={counts.notas} label="Notas" />
          {incidentGroups.length > 0 ? (
            <span className="summary-pill is-warning"><AlertTriangle size={15} /><strong>{incidentGroups.length}</strong><span>Incidencias</span></span>
          ) : null}
        </div>
        {canSynchronize ? <MeetArtifactsButton count={finishedMeet} /> : null}
      </section>

      {incidentGroups.length > 0 ? (
        <section className="recording-incidents content-section">
          <div className="section-heading recording-incidents-heading">
            <div>
              <h2>Incidencias de grabación <span className="section-count">{incidentGroups.length}</span></h2>
              <p>Pendientes de procesamiento o reuniones en las que Meet no registró una grabación.</p>
            </div>
          </div>
          <div className="incident-list">
            {incidentGroups.map((group) => {
              const event = group.events[0];
              const meeting = event.instancia;
              const association = meeting.solicitud.docentePrograma;
              const folderId = group.events.find(({ driveFolderId }) => driveFolderId)?.driveFolderId ?? null;
              const error = group.events.find(({ errorArchivos }) => errorArchivos)?.errorArchivos ?? null;
              const detectedConference = group.events.some(({ conferenceRecordName }) => Boolean(conferenceRecordName));
              const isMissing = group.kind === "missing";

              return (
                <details className={`incident-row ${isMissing ? "is-error" : "is-pending"}`} key={`${group.kind}-${group.instanciaId}`}>
                  <summary>
                    <div className="incident-date">{formatDateTime(meeting.inicioProgramadoAt)}</div>
                    <div className="incident-main">
                      <strong>{meeting.solicitud.titulo}</strong>
                      <span>{association.programa.nombre} · {association.docente.usuario.nombres} {association.docente.usuario.apellidos}</span>
                    </div>
                    <span className={`incident-status ${isMissing ? "is-error" : "is-pending"}`}>
                      {isMissing ? <AlertTriangle size={14} /> : <Video size={14} />}
                      {isMissing ? "No se grabó" : "Pendiente"}
                    </span>
                    <span className="incident-expand" aria-hidden="true"><ChevronDown size={18} /></span>
                  </summary>
                  <div className="incident-detail">
                    <div>
                      <strong>{isMissing ? "Meet no registró una sesión de grabación." : "La grabación todavía no está disponible."}</strong>
                      <p>
                        {isMissing
                          ? "La reunión requería grabación, pero Google no registró que un participante autorizado iniciara una."
                          : error
                            ? `La última revisión tuvo una incidencia: ${error}`
                            : detectedConference
                              ? "La conferencia ya fue detectada. Se seguirá revisando hasta que Google termine de procesar sus archivos."
                              : "Todavía se está esperando el registro finalizado de la conferencia."}
                      </p>
                    </div>
                    <div className="incident-actions">
                      {folderId ? (
                        <a className="text-link recording-folder-link" href={driveFolderUrl(folderId)} target="_blank" rel="noreferrer">
                          <FolderOpen size={16} />Abrir carpeta<ExternalLink size={13} />
                        </a>
                      ) : <span className="muted-text">{isMissing ? "Sin carpeta" : "Carpeta pendiente"}</span>}
                    </div>
                  </div>
                </details>
              );
            })}
          </div>
        </section>
      ) : null}

      {artifacts.length === 0 ? (
        <section className="content-section">
          <div className="empty-state"><Video size={24} /><p>Todavía no hay archivos de Meet disponibles.</p></div>
        </section>
      ) : (
        <section className="recording-library" aria-label="Archivos agrupados por reunión">
          <div className="recording-library-heading">
            <h2>Archivos disponibles</h2>
            <span>{artifactGroups.length} {artifactGroups.length === 1 ? "reunión" : "reuniones"}</span>
          </div>
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
                      <a className="secondary-action" href={driveFolderUrl(folderId)} target="_blank" rel="noreferrer">
                        <FolderOpen size={16} />Carpeta de la reunión<ExternalLink size={13} />
                      </a>
                    ) : <span className="muted-text">Carpeta no disponible</span>}
                  </div>
                </header>

                <div className="recording-file-grid">
                  {orderedArtifacts.map((artifact) => (
                    <article className={`recording-file-card ${artifactToneClass(artifact.tipo)}`} key={artifact.id}>
                      <div className="recording-file-icon" aria-hidden="true">{artifactTypeIcon(artifact.tipo, 20)}</div>
                      <div className="recording-file-copy">
                        <div className="recording-file-label">
                          <strong>{etiquetaTipoArtefactoMeet(artifact.tipo)}</strong>
                          <span>{artifactDetail(artifact.mimeType, artifact.tamanoBytes)}</span>
                        </div>
                        <p title={artifact.nombre}>{artifact.nombre}</p>
                      </div>
                      <div className="recording-file-action">
                        <a className={`recording-file-open ${artifact.tipo === "GRABACION" ? "is-primary" : ""}`.trim()} href={artifact.webViewUrl ?? driveFileUrl(artifact.driveFileId)} target="_blank" rel="noreferrer">
                          <ExternalLink size={16} />{artifact.tipo === "GRABACION" ? "Abrir grabación" : "Abrir archivo"}
                        </a>
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

function SummaryPill({ icon, count, label }: { icon: ReactNode; count: number; label: string }) {
  return <span className="summary-pill">{icon}<strong>{count}</strong><span>{label}</span></span>;
}

function groupRecordingEventsByMeeting<T extends { instancia: { id: string } }>(events: T[]) {
  return events.reduce<Array<{ instanciaId: string; events: T[] }>>((groups, event) => {
    const instanciaId = event.instancia.id;
    const existing = groups.find((group) => group.instanciaId === instanciaId);
    if (existing) existing.events.push(event);
    else groups.push({ instanciaId, events: [event] });
    return groups;
  }, []);
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
  return megabytes >= 1024 ? `${(megabytes / 1024).toFixed(1)} GB` : `${megabytes.toFixed(1)} MB`;
}

function driveFolderUrl(folderId: string): string {
  return `https://drive.google.com/drive/folders/${encodeURIComponent(folderId)}`;
}

function driveFileUrl(fileId: string): string {
  return `https://drive.google.com/open?id=${encodeURIComponent(fileId)}`;
}
