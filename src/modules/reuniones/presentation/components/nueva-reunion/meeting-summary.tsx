import { useState } from "react";
import { ordenarEncuentros, resumirFechas } from "./fechas-formulario";
import type { MeetingDate, MeetingDateMode, Option, ProgramOption } from "./tipos";
import styles from "./nueva-reunion.module.css";

export function MeetingSummary({ dates, dateMode, selectedProgram, isReady, academicReady, requiresAssistance, requiresRecording, meetingMode, canAssignAssistant, assistanceMode, selectedAssistant }: Readonly<{
  dates: readonly MeetingDate[];
  dateMode: MeetingDateMode;
  selectedProgram?: ProgramOption;
  isReady: boolean;
  academicReady: boolean;
  requiresAssistance: boolean;
  requiresRecording: boolean;
  meetingMode: "VIRTUAL" | "HIBRIDA";
  canAssignAssistant: boolean;
  assistanceMode: "OPEN" | "ASSIGN";
  selectedAssistant?: Option;
}>) {
  const [expanded, setExpanded] = useState(false);
  const { primera, ultima } = resumirFechas(dates);
  const estado = isReady ? "Listo para crear" : !selectedProgram ? "Elegí un programa" : !academicReady ? "Completá el título" : "Revisá fechas y horarios";
  const hibrida = requiresAssistance && meetingMode === "HIBRIDA";
  return (
    <aside className={styles.summary} aria-label="Resumen de la reunión">
      <h2 className={styles.summaryHeading}>Resumen de la reunión</h2>
      <button className={styles.summaryToggle} type="button" aria-expanded={expanded} aria-controls="resumen-reunion-contenido" onClick={() => setExpanded(!expanded)}>Resumen de la reunión <span aria-hidden="true">{expanded ? "−" : "+"}</span></button>
      {/* Solo cambian la cantidad y el estado de preparación: no se anuncia cada tecla. */}
      <p className={styles.summaryStatus} role="status" aria-live="polite">{dates.length} {dates.length === 1 ? "encuentro" : "encuentros"} · {estado}</p>
      <div id="resumen-reunion-contenido" className={styles.summaryContent} data-expanded={expanded}>
        <dl>
          <div><dt>Tipo</dt><dd>{dateMode === "SINGLE" ? "Reunión única" : "Serie de encuentros"}{dateMode === "RECURRENT" ? " · Semanal" : dateMode === "MANUAL" ? " · Fechas específicas" : ""}</dd></div>
          <div><dt>Programa</dt><dd>{selectedProgram?.label || "Pendiente"}</dd></div>
          <div><dt>Docente</dt><dd>{selectedProgram?.teacher || "Pendiente"}</dd></div>
          <div><dt>Primera fecha</dt><dd>{primera}</dd></div>
          <div><dt>Última fecha</dt><dd>{ultima}</dd></div>
          <div><dt>Zona horaria</dt><dd>America/Montevideo (UTC−3)</dd></div>
          <div><dt>Organización</dt><dd>{requiresAssistance ? "Con monitoreo" : "Sin monitoreo"} · {requiresRecording ? "Se graba" : "Sin grabación"}</dd></div>
          <div><dt>Modalidad</dt><dd>{hibrida ? "Híbrida" : "Virtual"}</dd></div>
          {requiresAssistance ? <div><dt>Cobertura</dt><dd>{hibrida ? "Llegada y salida definidas por encuentro; mínimo 30 minutos antes y después." : "Virtual: 15 minutos antes y fin exacto del encuentro."}</dd></div> : null}
          {requiresAssistance && canAssignAssistant ? <div><dt>Asignación</dt><dd>{assistanceMode === "ASSIGN" ? selectedAssistant?.label || "Elegí un asistente" : "Abierta a postulaciones"}</dd></div> : null}
        </dl>
        {hibrida ? <details className={styles.coverageDetails}><summary>Ver llegadas y salidas ({dates.length})</summary><ul>{ordenarEncuentros(dates).map((date) => <li key={date.id}><strong>{resumirFechas([date]).primera}</strong><span>Llegada: {date.horaAsistenciaInicio || "Pendiente"} · Salida: {date.horaAsistenciaFin || "Pendiente"}</span></li>)}</ul></details> : null}
        <p className={styles.linkNotice}>Un solo enlace de Zoom para todos los encuentros. Estará disponible cuando termine la creación.</p>
      </div>
    </aside>
  );
}
