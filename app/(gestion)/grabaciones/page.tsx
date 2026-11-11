import { Clock, FileText, FolderOpen, NotebookText, UsersRound, Video } from "lucide-react";
import type { ReactNode } from "react";
import { redirect } from "next/navigation";
import { auth } from "@/auth";
import { RecordingsLibrary } from "@/src/components/recordings-library";
import { FILTROS_CATEGORIA_ZOOM, ZoomArchivoProgreso } from "@/src/components/zoom-archivo-progreso";
import { listarInventarioZoomAdmin } from "@/src/bootstrap/zoom-historico.server";
import type { FiltroCategoriaZoom } from "@/src/modules/archivos/domain";
import { resolveSessionActor } from "@/src/lib/auth/session-actor.adapter";
import { db } from "@/src/lib/db";
import { listarGrabacionesDb } from "@/src/bootstrap/archivos.server";
import { obtenerCredencialPrincipalGoogleWorkspace } from "@/src/modules/configuracion/api";
import { normalizarParametrosGrabaciones } from "@/src/modules/archivos/domain/grabaciones-query.domain";
import {
  resolverEstadoVisualGrabacion,
  type GrupoEncuentroConArchivos
} from "@/src/modules/archivos/presentation";
import "./grabaciones.css";

export default async function GrabacionesPage({ searchParams }: { searchParams: Promise<{ pagina?: string; busqueda?: string; filtro?: string; zoomPagina?: string; zoomCategoria?: string; zoomVinculo?: string }> }) {
  const session = await auth();
  if (!session?.user) redirect("/acceso");
  const actor = await resolveSessionActor(db, { id: session.user.id, email: session.user.email });
  if (!actor?.activo) redirect("/acceso");

  const now = new Date();
  const parametros = await searchParams;
  const query = normalizarParametrosGrabaciones(parametros);
  const esAdmin = actor.rol === "ADMINISTRACION";
  const zoomCategoria: FiltroCategoriaZoom = (FILTROS_CATEGORIA_ZOOM as readonly string[]).includes(parametros.zoomCategoria ?? "")
    ? (parametros.zoomCategoria as FiltroCategoriaZoom) : "TODOS";
  const zoomVinculo = parametros.zoomVinculo === "SIN_VINCULO" ? "SIN_VINCULO" : "TODAS";
  const zoomPagina = Number.parseInt(parametros.zoomPagina ?? "1", 10);
  const [page, workspaceConfiguration] = await Promise.all([
    listarGrabacionesDb(actor, query),
    obtenerCredencialPrincipalGoogleWorkspace(db, (k) => k, { requireActiva: false })
  ]);
  // La carpeta general apunta a una raíz que puede contener el histórico de Zoom: solo administración.
  const generalFolderId = esAdmin && workspaceConfiguration?.activa
    ? workspaceConfiguration.driveDestinationId
    : null;

  const inventarioZoom = esAdmin ? await listarInventarioZoomAdmin(actor, { pagina: zoomPagina, vinculo: zoomVinculo }) : null;

  const counts = { grabaciones: page.conteos.grabaciones, transcripciones: page.conteos.transcripciones, asistencias: page.conteos.asistencias, notas: page.conteos.notas };

  const grupos: readonly GrupoEncuentroConArchivos[] = page.encuentros
    .map((g) => ({
      instanciaId: g.instanciaId,
      proveedor: g.proveedor,
      asistenciaHref: g.proveedor === "ZOOM" && g.asistenciaZoom
        ? `/reuniones/${encodeURIComponent(g.solicitudId)}/encuentros/${encodeURIComponent(g.instanciaId)}/asistencia`
        : null,
      titulo: g.titulo,
      programa: g.programa,
      docente: g.docente,
      fechaInicio: g.fechaInicio,
      folderId: g.folderId,
      requiereGrabacion: g.requiereGrabacion,
      estadoGrabacion: resolverEstadoVisualGrabacion({
        tieneArchivoGrabacion: g.archivos.some((a) => a.tipo === "GRABACION" && !a.pendienteZoom),
        archivosSincronizadosAt: g.archivosSincronizadosAt,
        finProgramadoAt: g.finProgramadoAt,
        requiereGrabacion: Boolean(g.requiereGrabacion),
        // Un video de Zoom aún sin conservar se informa como procesamiento en curso.
        estadoDetectado: g.proveedor === "ZOOM"
          ? (g.archivos.some((a) => a.tipo === "GRABACION" && a.pendienteZoom) ? "PROCESANDO" : null)
          : g.estadoGrabacionMeet,
        observadoAt: g.proveedor === "ZOOM" ? now : g.grabacionObservadaAt,
        ahora: now
      }),
      archivos: g.archivos.map((a) => ({ ...a, tamanoBytes: a.tamanoBytes ? Number(a.tamanoBytes) : null }))
    }))
    .sort(
      (left, right) =>
        new Date(right.fechaInicio).getTime() - new Date(left.fechaInicio).getTime()
    );

  return (
    <div className="recordings-page">
      <header className="page-header recordings-header">
        <div>
          <p className="page-eyebrow">Google Meet · Zoom</p>
          <h1>Grabaciones y archivos</h1>
          <p>
            {page.totalEncuentros} {page.totalEncuentros === 1 ? "encuentro con archivos o grabación detectada" : "encuentros con archivos o grabaciones detectadas"}.
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
          {inventarioZoom?.tipo === "OK" ? (
            <a className="summary-pill zoom-jump-pill" href="#archivos-zoom">
              <strong>{inventarioZoom.pagina.totalOcurrencias}</strong>
              <span>Inventario Zoom</span>
            </a>
          ) : null}
        </div>
        <div className="recordings-sync-badge">
          <Clock size={14} aria-hidden="true" />
          Sincronización automática activa
        </div>
      </section>

      <RecordingsLibrary
        grupos={grupos}
        pagina={page.pagina}
        totalPaginas={page.totalPaginas}
        busqueda={query.busqueda}
        filtro={query.filtro}
        conteos={page.conteos}
        totalEncuentros={page.totalEncuentros}
        esAdmin={esAdmin}
      />

      {inventarioZoom?.tipo === "OK" ? (
        <ZoomArchivoProgreso datos={inventarioZoom.pagina} categoria={zoomCategoria} vinculo={zoomVinculo} />
      ) : null}
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
