import { Activity, AlertTriangle, CalendarClock, CheckCircle2, ClipboardList, Clock3, ExternalLink, FileText, Hash, Radio, Users, Video, Settings2, ShieldCheck, LockKeyhole } from "lucide-react";
import Link from "next/link";
import type { ReunionOperativaView } from "@/src/modules/reuniones/reunion-operativa.service";
import { ZoomPasscodeControl } from "@/src/components/zoom-passcode-control";
import { MeetingScheduleTimes } from "@/src/components/meeting-schedule-times";
import { OperationalIncidentForm } from "@/src/components/operational-incident-form";
import { OperationalAssistanceClosureForm } from "@/src/components/operational-assistance-closure-form";
import { AssistantSelfUnassignButton } from "@/src/modules/asistencia/presentation/components/assistant-self-unassign-button";
import { formatDate, formatTime } from "@/src/lib/ui/format";
import styles from "./reunion-zoom-operativa.module.css";
import { NavegacionEncuentroZoom } from "./navegacion-encuentro-zoom";

/** La consola Zoom no debe presentar datos o controles de Google Meet como propios.
 * El sistema todavía no consulta participantes ni estadísticas en vivo de Zoom.
 */
export function ReunionZoomOperativa({
  reunion, rol, salaEspera
}: Readonly<{
  reunion: ReunionOperativaView;
  rol: "ADMINISTRACION" | "DOCENTE" | "ASISTENTE_TECNICO";
  salaEspera: boolean | null;
}>) {
  const esAsistente = rol === "ASISTENTE_TECNICO";
  const enlace = reunion.zoom.joinUrl;
  const puedeDesasignarse = esAsistente && Boolean(reunion.asistencia.asignacionId)
    && reunion.asistencia.inicioAt > reunion.actualizadoAt;
  const completada = reunion.estado === "FINALIZADA" || reunion.estado === "NO_INICIADA";

  return (
    <main className={styles.page}>
      <NavegacionEncuentroZoom reunion={reunion} rol={rol} historica={false} />

      <header className={styles.hero}>
        <div className={styles.eyebrow}><span>{reunion.programa}</span><span className={styles.provider}><Video size={15} /> Zoom</span></div>
        <h1>{reunion.titulo}</h1>
        <p className={styles.subtitle}>{reunion.docente}{reunion.docenteEmail ? ` · ${reunion.docenteEmail}` : ""}</p>
        <div className={styles.chips} aria-label="Fecha y horario">
          <span><CalendarClock size={15} /> {formatDate(reunion.inicioProgramadoAt)}</span>
          <span><Clock3 size={15} /> {formatTime(reunion.inicioProgramadoAt)} – {formatTime(reunion.finProgramadoAt)}</span>
          <span>{reunion.modalidad === "HIBRIDA" ? "Híbrida" : "Virtual"}</span>
        </div>
        <details className={styles.scheduleDetails}><summary>Ver horarios de asistencia</summary><MeetingScheduleTimes startsAt={reunion.inicioProgramadoAt} endsAt={reunion.finProgramadoAt}
          requiresAssistance={reunion.asistencia.requerida} modality={reunion.modalidad}
          assistanceStartsAt={reunion.asistencia.inicioAt} assistanceEndsAt={reunion.asistencia.finAt}
          viewerIsAssistant={esAsistente} compact /></details>
        <div className={styles.actions}>
          {enlace ? (
            <a href={enlace} rel="noreferrer" target="_blank" className={styles.primary}>
              <ExternalLink size={17} aria-hidden="true" /> Unirse a Zoom
            </a>
          ) : <span className={styles.pending}><AlertTriangle size={16} /> Enlace Zoom pendiente</span>}

          {puedeDesasignarse && reunion.asistencia.asignacionId ?
            <AssistantSelfUnassignButton assignmentId={reunion.asistencia.asignacionId} title={reunion.titulo} /> : null}
        </div>
      </header>

      <section className={styles.securityCard} aria-label="Seguridad y acceso de Zoom">
        <div className={styles.heading}><ShieldCheck size={20} aria-hidden="true" /><h2>Seguridad y acceso</h2></div>
        <p className={styles.note}>Configuración consultada en Zoom. Los cambios pueden afectar a toda una serie de reuniones.</p>
        <div className={styles.securityGrid}>
          <div className={styles.securityItem}>
            <div className={styles.securityLabel}><Users size={19} aria-hidden="true" /><strong>Sala de espera</strong></div>
            <span className={salaEspera === true ? styles.enabled : salaEspera === false ? styles.disabled : styles.unknown}>
              {salaEspera === true ? "Habilitada" : salaEspera === false ? "Deshabilitada" : "Sin verificar"}
            </span>
            <small>Información de Zoom · Solo lectura</small>
          </div>
          <div className={styles.securityItem}>
            <div className={styles.securityLabel}><LockKeyhole size={19} aria-hidden="true" /><strong>Código de acceso</strong></div>
            {rol === "ADMINISTRACION" ? <ZoomPasscodeControl instanciaId={reunion.id} /> :
              <p className={styles.note}>La consulta y gestión del código requieren permisos de administración.</p>}
          </div>
        </div>
      </section>

      <section className={styles.card} aria-label="Estado de la reunión">
        <div className={styles.heading}><Activity size={19} aria-hidden="true" /><h2>Estado de la reunión</h2></div>
        <p className={styles.status}>{reunion.estado.replaceAll("_", " ").toLowerCase()}</p>
        <div className={styles.statusGrid}>
          <div><Video size={18} aria-hidden="true" /><strong>Zoom</strong><span>{reunion.zoom.estadoIntegracion ?? "Pendiente"}</span></div>
          <div><Users size={18} aria-hidden="true" /><strong>Asistencia</strong><span>Sin datos en vivo</span></div>
          <div><Radio size={18} aria-hidden="true" /><strong>Grabación</strong><span>{reunion.requiereGrabacion ? "Solicitada" : "No solicitada"}</span></div>

        </div>
        <p className={styles.note}>La programación no confirma que la sesión esté activa. SalaVirtual aún no recibe participantes en vivo de Zoom.</p>
        {reunion.zoom.errorIntegracion ? <p role="alert" className={styles.warning}>{reunion.zoom.errorIntegracion}</p> : null}
      </section>

      <section className={styles.card} aria-label="Acciones rápidas">
        <div className={styles.heading}><ClipboardList size={19} aria-hidden="true" /><h2>Acciones rápidas</h2></div>
        <div className={styles.quickActions}>
          {!esAsistente ? <Link href={`/reuniones/${reunion.solicitudId}`}><FileText size={19} /> Ficha completa</Link> : null}
          <Link href="/grabaciones"><FileText size={19} /> Grabaciones</Link>
          <a href="#incidencias"><AlertTriangle size={19} /> Incidencias</a>
          <a href="#datos-zoom"><Settings2 size={19} /> Datos técnicos</a>
        </div>
      </section>

      <section id="incidencias" className={styles.card}>
        <div className={styles.heading}><AlertTriangle size={19} aria-hidden="true" /><h2>Incidencias ({reunion.incidencias.filter((i) => i.estado === "ABIERTA" || i.estado === "EN_ANALISIS").length} abiertas)</h2></div>
        <details className={styles.incidents}>
          <summary>Ver historial de incidencias</summary>
          {reunion.incidencias.length ? (
            <ul>{reunion.incidencias.map((i) => <li key={i.id}><strong>{i.tipo.replaceAll("_", " ")}</strong> · {i.estado}<p>{i.descripcion}</p></li>)}</ul>
          ) : <p>No hay incidencias registradas.</p>}
        </details>
        <OperationalIncidentForm instanciaId={reunion.id} />
      </section>

      <details id="datos-zoom" className={styles.advanced}>
        <summary><Hash size={18} aria-hidden="true" /> Datos técnicos y configuración de Zoom</summary>
        <dl className={styles.facts}>
          <div><dt>ID de reunión</dt><dd className={styles.mono}>{reunion.zoom.id ?? "Pendiente"}</dd></div>
          <div><dt>Cuenta anfitriona</dt><dd>{reunion.zoom.anfitrion ?? "Sin asignar"}</dd></div>
          <div><dt>Integración</dt><dd>{reunion.zoom.estadoIntegracion ?? "Pendiente"}</dd></div>
          <div><dt>Operación pendiente</dt><dd>{reunion.zoom.operacionPendiente ?? "Ninguna"}</dd></div>
          <div><dt>Monitoreo</dt><dd>{reunion.asistencia.requerida ? reunion.asistencia.asistente ?? "Pendiente de asignación" : "No requerido"}</dd></div>
        </dl>
        <p className={styles.note}>La admisión, los coanfitriones y la grabación se administran desde Zoom.</p>
      </details>
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
