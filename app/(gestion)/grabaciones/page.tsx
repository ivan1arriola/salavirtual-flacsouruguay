import { Clock, FileText, FolderOpen, NotebookText, UsersRound, Video } from "lucide-react";
import type { ReactNode } from "react";
import { redirect } from "next/navigation";
import { auth } from "@/auth";
import { RecordingsLibrary } from "@/src/components/recordings-library";
import { resolveSessionActor } from "@/src/lib/auth/session-actor.adapter";
import { db } from "@/src/lib/db";
import { listarArchivosMeetVisibles } from "@/src/bootstrap/archivos.server";
import {
  resolverEstadoVisualGrabacion,
  type GrupoEncuentroConArchivos
} from "@/src/modules/archivos/presentation";
import type { TipoArtefactoMeet } from "@/src/modules/archivos/presentation";
import "./grabaciones.css";

export default async function GrabacionesPage() {
  const session = await auth();
  if (!session?.user) redirect("/acceso");
  const actor = await resolveSessionActor(db, { id: session.user.id, email: session.user.email });
  if (!actor?.activo) redirect("/acceso");

  const now = new Date();
  const [artifacts, workspaceConfiguration] = await Promise.all([
    listarArchivosMeetVisibles(actor),
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

  const groupsMap = new Map<
    string,
    {
      instanciaId: string;
      titulo: string;
      programa: string;
      docente: string;
      fechaInicio: Date;
      folderId?: string | null;
      requiereGrabacion?: boolean;
      archivosSincronizadosAt: Date | null;
      finProgramadoAt: Date;
      archivos: Array<{
        id: string;
        tipo: TipoArtefactoMeet;
        nombre?: string;
        webViewUrl?: string | null;
        tamanoBytes?: number | null;
        mimeType?: string | null;
      }>;
    }
  >();

  for (const artifact of artifacts) {
    const instancia = artifact.eventoProveedor.instancia;
    const instanciaId = instancia.id;
    const docenteUsuario = instancia.solicitud.docentePrograma.docente.usuario;

    let group = groupsMap.get(instanciaId);
    if (!group) {
      group = {
        instanciaId,
        titulo: instancia.solicitud.titulo,
        programa: instancia.solicitud.docentePrograma.programa.nombre,
        docente: `${docenteUsuario.nombres} ${docenteUsuario.apellidos}`.trim(),
        fechaInicio: instancia.inicioProgramadoAt,
        folderId: artifact.eventoProveedor.driveFolderId,
        requiereGrabacion: instancia.requiereGrabacion,
        archivosSincronizadosAt: artifact.eventoProveedor.archivosSincronizadosAt,
        finProgramadoAt: instancia.finProgramadoAt,
        archivos: []
      };
      groupsMap.set(instanciaId, group);
    }

    group.archivos.push({
      id: artifact.driveFileId,
      tipo: artifact.tipo,
      nombre: artifact.nombre,
      webViewUrl: artifact.webViewUrl,
      tamanoBytes: artifact.tamanoBytes ? Number(artifact.tamanoBytes) : null,
      mimeType: artifact.mimeType
    });
  }

  const grupos: readonly GrupoEncuentroConArchivos[] = Array.from(groupsMap.values())
    .map((g) => ({
      instanciaId: g.instanciaId,
      titulo: g.titulo,
      programa: g.programa,
      docente: g.docente,
      fechaInicio: g.fechaInicio,
      folderId: g.folderId,
      requiereGrabacion: g.requiereGrabacion,
      estadoGrabacion: resolverEstadoVisualGrabacion({
        tieneArchivoGrabacion: g.archivos.some((a) => a.tipo === "GRABACION"),
        archivosSincronizadosAt: g.archivosSincronizadosAt,
        finProgramadoAt: g.finProgramadoAt,
        requiereGrabacion: Boolean(g.requiereGrabacion),
        ahora: now
      }),
      archivos: g.archivos
    }))
    .sort(
      (left, right) =>
        new Date(right.fechaInicio).getTime() - new Date(left.fechaInicio).getTime()
    );

  return (
    <div className="recordings-page">
      <header className="page-header recordings-header">
        <div>
          <p className="page-eyebrow">Google Meet</p>
          <h1>Grabaciones y archivos</h1>
          <p>
            {artifacts.length} {artifacts.length === 1 ? "archivo disponible" : "archivos disponibles"} en{" "}
            {grupos.length} {grupos.length === 1 ? "reunión" : "reuniones"}.
          </p>
        </div>
        {generalFolderId ? (
          <a
            className="primary-action"
            href={driveFolderUrl(generalFolderId)}
            target="_blank"
            rel="noreferrer"
          >
            <FolderOpen size={18} />
            Carpeta general en Drive
          </a>
        ) : (
          <Video size={28} color="var(--brand)" aria-hidden="true" />
        )}
      </header>

      <section className="recordings-toolbar" aria-label="Resumen de archivos y acciones">
        <div className="recordings-summary-compact">
          <SummaryPill icon={<Video size={15} />} count={counts.grabaciones} label="Grabaciones" />
          <SummaryPill icon={<FileText size={15} />} count={counts.transcripciones} label="Transcripciones" />
          <SummaryPill icon={<UsersRound size={15} />} count={counts.asistencias} label="Asistencias" />
          <SummaryPill icon={<NotebookText size={15} />} count={counts.notas} label="Notas" />
        </div>
        <div className="recordings-sync-badge">
          <Clock size={14} aria-hidden="true" />
          Sincronización automática activa (cada 10 min)
        </div>
      </section>

      <RecordingsLibrary grupos={grupos} />
    </div>
  );
}

function SummaryPill({ icon, count, label }: { icon: ReactNode; count: number; label: string }) {
  return (
    <span className="summary-pill">
      {icon}
      <strong>{count}</strong>
      <span>{label}</span>
    </span>
  );
}

function driveFolderUrl(folderId: string): string {
  return `https://drive.google.com/drive/folders/${encodeURIComponent(folderId)}`;
}
