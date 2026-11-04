import { Activity, AlertTriangle, ArrowLeft, CalendarClock, CheckCircle2, ClipboardList, Clock3, ExternalLink, FileText, Hash, Radio, Users, Video } from "lucide-react";
import Link from "next/link";
import type { ReunionOperativaView } from "@/src/modules/reuniones/reunion-operativa.service";
import { RefreshButton } from "@/src/components/refresh-button";
import { MeetingScheduleTimes } from "@/src/components/meeting-schedule-times";
import { OperationalIncidentForm } from "@/src/components/operational-incident-form";
import { OperationalAssistanceClosureForm } from "@/src/components/operational-assistance-closure-form";
import { OperationalAutoRefresh } from "@/src/components/operational-auto-refresh";
import { AssistantSelfUnassignButton } from "@/src/modules/asistencia/presentation/components/assistant-self-unassign-button";
import { formatDate, formatTime } from "@/src/lib/ui/format";
import styles from "./reunion-zoom-operativa.module.css";

/** La consola Zoom no debe presentar datos o controles de Google Meet como propios.
 * El sistema todavía no consulta participantes ni estadísticas en vivo de Zoom.
 */
export function ReunionZoomOperativa({
  reunion, rol
}: Readonly<{
  reunion: ReunionOperativaView;
  rol: "ADMINISTRACION" | "DOCENTE" | "ASISTENTE_TECNICO";
}>) {
  const esAsistente = rol === "ASISTENTE_TECNICO";
  const backHref = esAsistente ? "/mi-agenda" : "/reuniones?proveedor=zoom";
  const enlace = reunion.zoom.joinUrl;
  const puedeDesasignarse = esAsistente && Boolean(reunion.asistencia.asignacionId)
    && reunion.asistencia.inicioAt > reunion.actualizadoAt;
  const completada = reunion.estado === "FINALIZADA" || reunion.estado === "NO_INICIADA";

  return (
    <main className={styles.page}>
      <nav className={styles.toolbar} aria-label="Acciones de navegación">
        <Link href={backHref} className={styles.back}><ArrowLeft size={17} aria-hidden="true" /> Volver a reuniones</Link>
        <div className={styles.refresh}>
          <OperationalAutoRefresh enabled={reunion.estado === "ESPERANDO_INICIO" || reunion.estado === "EN_CURSO"} />
          <RefreshButton />
        </div>
      </nav>

      <header className={styles.hero}>
        <div className={styles.eyebrow}><span>{reunion.programa}</span><span className={styles.provider}><Video size={15} /> Zoom</span></div>
        <h1>{reunion.titulo}</h1>
        <p className={styles.subtitle}>{reunion.docente}{reunion.docenteEmail ? ` · ${reunion.docenteEmail}` : ""}</p>
        <div className={styles.chips}>
          <span><CalendarClock size={15} /> {formatDate(reunion.inicioProgramadoAt)}</span>
          <span><Clock3 size={15} /> {formatTime(reunion.inicioProgramadoAt)} – {formatTime(reunion.finProgramadoAt)}</span>
          <span>{reunion.modalidad === "HIBRIDA" ? "Híbrida" : "Virtual"}</span>
        </div>
        <MeetingScheduleTimes startsAt={reunion.inicioProgramadoAt} endsAt={reunion.finProgramadoAt}
          requiresAssistance={reunion.asistencia.requerida} modality={reunion.modalidad}
          assistanceStartsAt={reunion.asistencia.inicioAt} assistanceEndsAt={reunion.asistencia.finAt}
          viewerIsAssistant={esAsistente} compact />
        <div className={styles.actions}>
          {enlace ? (
            <a href={enlace} rel="noreferrer" target="_blank" className={styles.primary}>
              <ExternalLink size={17} aria-hidden="true" /> Unirse a Zoom
            </a>
          ) : <span className={styles.pending}><AlertTriangle size={16} /> Enlace Zoom pendiente</span>}
          {!esAsistente ? <Link className={styles.secondary} href={`/reuniones/${reunion.solicitudId}`}>Ver ficha completa</Link> : null}
          {puedeDesasignarse && reunion.asistencia.asignacionId ?
            <AssistantSelfUnassignButton assignmentId={reunion.asistencia.asignacionId} title={reunion.titulo} /> : null}
        </div>
      </header>

      <section className={styles.grid} aria-label="Estado y datos de la reunión Zoom">
        <article className={styles.card}>
          <div className={styles.heading}><Hash size={19} aria-hidden="true" /><h2>Datos de Zoom</h2></div>
          <dl className={styles.facts}>
            <div><dt>ID de reunión</dt><dd className={styles.mono}>{reunion.zoom.id ?? "Pendiente"}</dd></div>
            <div><dt>Cuenta anfitriona</dt><dd>{reunion.zoom.anfitrion ?? "Sin asignar"}</dd></div>
            <div><dt>Integración</dt><dd>{reunion.zoom.estadoIntegracion ?? "Pendiente"}</dd></div>
            <div><dt>Operación pendiente</dt><dd>{reunion.zoom.operacionPendiente ?? "Ninguna"}</dd></div>
          </dl>
          {reunion.zoom.errorIntegracion ? <p role="alert" className={styles.warning}>{reunion.zoom.errorIntegracion}</p> : null}
        </article>

        <article className={styles.card}>
          <div className={styles.heading}><Activity size={19} aria-hidden="true" /><h2>Estado operativo</h2></div>
          <p className={styles.status}>{reunion.estado.replaceAll("_", " ").toLowerCase()}</p>
          <p className={styles.note}>La programación no confirma que haya participantes conectados ni una sesión activa.</p>
          <p><strong>Grabación solicitada:</strong> {reunion.requiereGrabacion ? "Sí" : "No"}</p>
          <p><strong>Monitoreo:</strong> {reunion.asistencia.requerida ? reunion.asistencia.asistente ?? "Pendiente de asignación" : "No requerido"}</p>
        </article>

        <article className={styles.card}>
          <div className={styles.heading}><Users size={19} aria-hidden="true" /><h2>Participantes</h2></div>
          <div className={styles.unavailable}><Radio size={17} aria-hidden="true" /><strong>Sin datos en vivo de Zoom</strong></div>
          <p className={styles.note}>SalaVirtual todavía no sincroniza el listado de conectados, las entradas ni las salidas desde Zoom. No se muestran cifras de Google Meet como si fueran de Zoom.</p>
        </article>

        <article className={styles.card}>
          <div className={styles.heading}><FileText size={19} aria-hidden="true" /><h2>Grabaciones y transcripciones</h2></div>
          <p className={styles.note}>Los estados en vivo de Google Meet no son aplicables a esta reunión. Consultá las grabaciones de Zoom desde la sección de archivos cuando estén sincronizadas.</p>
          <Link href="/grabaciones" className={styles.secondary}>Ver grabaciones y archivos</Link>
        </article>
      </section>

      <section className={styles.notice} role="note">
        <ClipboardList size={20} aria-hidden="true" />
        <div><strong>Configuración operativa de Zoom</strong>
          <p>Las políticas de admisión, coanfitriones y grabación se administran desde Zoom. Los controles remotos exclusivos de Google Meet no se aplican aquí.</p>
        </div>
      </section>

      <details className={styles.incidents}>
        <summary>Incidencias ({reunion.incidencias.filter((i) => i.estado === "ABIERTA" || i.estado === "EN_ANALISIS").length} abiertas)</summary>
        {reunion.incidencias.length ? (
          <ul>{reunion.incidencias.map((i) => <li key={i.id}><strong>{i.tipo.replaceAll("_"," ")}</strong> · {i.estado}<p>{i.descripcion}</p></li>)}</ul>
        ) : <p>No hay incidencias registradas.</p>}
      </details>
      <OperationalIncidentForm instanciaId={reunion.id} />
      {esAsistente && reunion.asistencia.asignacionId && completada ? (
        <OperationalAssistanceClosureForm asignacionId={reunion.asistencia.asignacionId}
          inicioProgramado={reunion.asistencia.inicioAt.toISOString()}
          finProgramado={reunion.asistencia.finAt.toISOString()}
          cierreConfirmado={reunion.asistencia.cierreConfirmado} />
      ) : null}
      <footer className={styles.footer}><CheckCircle2 size={15} aria-hidden="true" /> Información institucional de SalaVirtual · Última revisión {formatTime(reunion.actualizadoAt)}</footer>
    </main>
  );
}
