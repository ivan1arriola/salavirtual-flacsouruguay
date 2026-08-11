import { ExternalLink, FolderOpen, Play, Video } from "lucide-react";
import Link from "next/link";
import { redirect } from "next/navigation";
import { auth } from "@/auth";
import { MeetArtifactsButton } from "@/src/components/meet-artifacts-button";
import { resolveSessionActor } from "@/src/lib/auth/session-actor.adapter";
import { db } from "@/src/lib/db";
import { formatDateTime } from "@/src/lib/ui/format";
import { listarGrabacionesVisibles } from "@/src/modules/meet/grabaciones.adapter";
import { puedeSincronizarGrabaciones } from "@/src/modules/meet/grabaciones.domain";

export default async function GrabacionesPage() {
  const session = await auth();
  if (!session?.user) redirect("/acceso");
  const actor = await resolveSessionActor(db, { id: session.user.id, email: session.user.email });
  if (!actor?.activo) redirect("/acceso");
  const canSynchronize = puedeSincronizarGrabaciones(actor.rol);
  const now = new Date();
  const [recordings, finishedMeet, workspaceConfiguration] = await Promise.all([
    listarGrabacionesVisibles(db, actor),
    canSynchronize
      ? db.eventoProveedor.count({
          where: {
            proveedor: { tipo: "GOOGLE_MEET" },
            estadoIntegracion: "SINCRONIZADA",
            instancia: {
              finProgramadoAt: {
                gte: new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000),
                lte: now
              },
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

  return (
    <>
      <header className="page-header">
        <div>
          <p className="page-eyebrow">Google Meet</p>
          <h1>Grabaciones</h1>
          <p>{recordings.length} grabaciones disponibles.</p>
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

      <section className="content-section">
        {recordings.length === 0 ? (
          <div className="empty-state"><Video size={24} /><p>Todavía no hay grabaciones disponibles.</p></div>
        ) : (
          <div className="table-wrap">
            <table className="data-table">
              <thead><tr><th>Fecha</th><th>Reunión</th><th>Programa</th><th>Archivo</th><th>Carpeta</th><th>Ver</th></tr></thead>
              <tbody>
                {recordings.map((recording) => {
                  const meeting = recording.eventoProveedor.instancia;
                  const association = meeting.solicitud.docentePrograma;
                  return (
                    <tr key={recording.id}>
                      <td className="date-cell">{formatDateTime(meeting.inicioProgramadoAt)}</td>
                      <td><strong>{meeting.solicitud.titulo}</strong><small>{association.docente.usuario.nombres} {association.docente.usuario.apellidos}</small></td>
                      <td>{association.programa.nombre}</td>
                      <td><strong>{recording.nombre}</strong><small>{formatFileSize(recording.tamanoBytes)}</small></td>
                      <td>
                        {recording.eventoProveedor.driveFolderId ? (
                          <a
                            className="text-link recording-folder-link"
                            href={driveFolderUrl(recording.eventoProveedor.driveFolderId)}
                            target="_blank"
                            rel="noreferrer"
                          >
                            <FolderOpen size={16} />Abrir carpeta<ExternalLink size={13} />
                          </a>
                        ) : <span className="muted-text">No disponible</span>}
                      </td>
                      <td>
                        <Link className="icon-link" href={`/grabaciones/${recording.id}`} title="Reproducir grabación">
                          <Play size={17} fill="currentColor" /><span className="sr-only">Reproducir grabación</span>
                        </Link>
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
