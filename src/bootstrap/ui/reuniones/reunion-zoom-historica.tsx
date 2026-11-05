import { AlertTriangle, ArrowLeft, CalendarDays, Clock3, ExternalLink, FileText, History, Radio, Users, Video } from "lucide-react";
import Link from "next/link";
import type { ReunionOperativaView } from "@/src/modules/reuniones/reunion-operativa.service";
import { formatDate, formatTime } from "@/src/lib/ui/format";
import styles from "./reunion-zoom-operativa.module.css";

export function ReunionZoomHistorica({ reunion, rol }: Readonly<{
  reunion: ReunionOperativaView;
  rol: "ADMINISTRACION" | "DOCENTE" | "ASISTENTE_TECNICO";
}>) {
  const incidenciasAbiertas = reunion.incidencias.filter(i => i.estado === "ABIERTA" || i.estado === "EN_ANALISIS");
  const esAsistente = rol === "ASISTENTE_TECNICO";
  const estado = reunion.estado === "FINALIZADA" ? "Finalizada" : reunion.estado === "NO_INICIADA" ? "No iniciada" : reunion.estado.replaceAll("_", " ");
  return (
    <main className={styles.page}>
      <nav className={styles.toolbar} aria-label="Navegación">
        <Link href={esAsistente ? "/mi-agenda" : "/reuniones?proveedor=zoom"} className={styles.back}><ArrowLeft size={17} /> Volver a reuniones</Link>
        <span className={styles.historyTag}><History size={15} /> Historial</span>
      </nav>
      <header className={styles.hero}>
        <div className={styles.eyebrow}><span>{reunion.programa}</span><span className={styles.provider}><Video size={15} /> Zoom</span><span className={styles.historyTag}>{estado}</span></div>
        <h1>{reunion.titulo}</h1>
        <p className={styles.subtitle}>{reunion.docente}{reunion.docenteEmail ? ` · ${reunion.docenteEmail}` : ""}</p>
        <div className={styles.chips}>
          <span><CalendarDays size={15} /> {formatDate(reunion.inicioProgramadoAt)}</span>
          <span><Clock3 size={15} /> {formatTime(reunion.inicioProgramadoAt)} – {formatTime(reunion.finProgramadoAt)} (programado)</span>
          <span>{reunion.modalidad === "HIBRIDA" ? "Híbrida" : "Virtual"}</span>
        </div>
        <p className={styles.note}>Esta ficha conserva la programación y los registros institucionales. No implica que Zoom haya confirmado la realización ni la duración efectiva de la reunión.</p>
      </header>
      <section className={styles.card} aria-labelledby="historical-summary">
        <div className={styles.heading}><History size={19} /><h2 id="historical-summary">Resumen histórico</h2></div>
        <div className={styles.historyGrid}>
          <div><Clock3 size={19}/><span>Horario real</span><strong>No disponible</strong><small>Se muestra únicamente el horario programado arriba.</small></div>
          <div><Users size={19}/><span>Participantes reales</span><strong>Sin reporte</strong><small>No se interpreta como cero asistentes.</small></div>
          <div><Radio size={19}/><span>Grabación</span><strong>{reunion.requiereGrabacion ? "Solicitada" : "No solicitada"}</strong><small>La solicitud no confirma que exista un archivo.</small></div>
          <div><AlertTriangle size={19}/><span>Incidencias abiertas</span><strong>{incidenciasAbiertas.length}</strong><small>{reunion.incidencias.length} registradas en total.</small></div>
        </div>
      </section>
      <section className={styles.card} aria-label="Registros de la reunión">
        <div className={styles.heading}><FileText size={19}/><h2>Registros y seguimiento</h2></div>
        <details className={styles.incidents}>
          <summary>Incidencias ({reunion.incidencias.length})</summary>
          {reunion.incidencias.length ? <ul>{reunion.incidencias.map(i => <li key={i.id}><strong>{i.tipo.replaceAll("_"," ")} · {i.estado}</strong><p>{i.descripcion}</p></li>)}</ul> : <p>No hay incidencias registradas.</p>}
        </details>
        <div className={styles.quickActions}>
          {!esAsistente ? <Link href={`/reuniones/${reunion.solicitudId}`}><FileText size={18}/> Ficha completa</Link> : null}
          <Link href="/grabaciones"><Video size={18}/> Consultar grabaciones</Link>
        </div>
      </section>
      <details className={styles.advanced}>
        <summary><Video size={18}/> Identificación y datos técnicos</summary>
        <dl className={styles.facts}>
          <div><dt>ID Zoom</dt><dd className={styles.mono}>{reunion.zoom.id ?? "No disponible"}</dd></div>
          <div><dt>Cuenta anfitriona</dt><dd>{reunion.zoom.anfitrion ?? "Sin asignar"}</dd></div>
          <div><dt>Integración</dt><dd>{reunion.zoom.estadoIntegracion ?? "Sin verificar"}</dd></div>
          <div><dt>Asistente técnico</dt><dd>{reunion.asistencia.asistente ?? "Sin asignar"}</dd></div>
        </dl>
        {reunion.zoom.joinUrl ? <a className={styles.back} href={reunion.zoom.joinUrl} target="_blank" rel="noreferrer"><ExternalLink size={15}/> Enlace original de Zoom</a> : null}
      </details>
    </main>
  );
}
