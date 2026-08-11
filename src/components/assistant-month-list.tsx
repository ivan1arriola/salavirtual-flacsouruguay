"use client";

import { AlertTriangle, CheckCircle2, Clock3, FilePenLine, MessageSquareText } from "lucide-react";
import { useRouter } from "next/navigation";
import { FormEvent, useState } from "react";
import { formatMinutes } from "@/src/lib/ui/assistant-format";
import type { RegistroAsistenciaPersonal } from "@/src/modules/asistencia/resumen-personal.domain";

const dateFormatter = new Intl.DateTimeFormat("es-UY", {
  timeZone: "America/Montevideo",
  day: "2-digit",
  month: "short"
});
const timeFormatter = new Intl.DateTimeFormat("es-UY", {
  timeZone: "America/Montevideo",
  hour: "2-digit",
  minute: "2-digit",
  hourCycle: "h23"
});

export function AssistantMonthList({
  meetings
}: Readonly<{ meetings: readonly RegistroAsistenciaPersonal[] }>) {
  const router = useRouter();
  const [selected, setSelected] = useState<RegistroAsistenciaPersonal | null>(null);
  const [minutes, setMinutes] = useState("");
  const [actualStart, setActualStart] = useState("");
  const [actualEnd, setActualEnd] = useState("");
  const [comment, setComment] = useState("");
  const [hasIncident, setHasIncident] = useState(false);
  const [incidentType, setIncidentType] = useState("Problema operativo");
  const [incidentSeverity, setIncidentSeverity] = useState("MEDIA");
  const [incidentDescription, setIncidentDescription] = useState("");
  const [pending, setPending] = useState(false);
  const [error, setError] = useState("");

  function openReport(meeting: RegistroAsistenciaPersonal) {
    setSelected(meeting);
    setMinutes(String(meeting.minutosReportados ?? meeting.minutosProgramados));
    setActualStart(toMontevideoInput(meeting.inicioRealAt ?? meeting.inicioAt));
    setActualEnd(toMontevideoInput(meeting.finRealAt ?? meeting.finAt));
    setComment(meeting.comentarioReporte ?? "");
    setHasIncident(false);
    setIncidentType("Problema operativo");
    setIncidentSeverity("MEDIA");
    setIncidentDescription("");
    setError("");
  }

  function closeReport() {
    if (pending) return;
    setSelected(null);
    setError("");
  }

  async function submitReport(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!selected) return;
    setPending(true);
    setError("");
    const response = await fetch("/api/v1/asistencia/duracion", {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        asignacionId: selected.id,
        inicioReal: montevideoInputToIso(actualStart),
        finReal: montevideoInputToIso(actualEnd),
        comentario: comment || undefined,
        incidencia: hasIncident ? {
          tipo: incidentType,
          severidad: incidentSeverity,
          descripcion: incidentDescription
        } : undefined
      })
    });
    const result = await response.json().catch(() => ({}));
    setPending(false);
    if (!response.ok) {
      setError(result.error ?? "No se pudo guardar la duración.");
      return;
    }
    setSelected(null);
    router.refresh();
  }

  return (
    <>
      <div className="assistant-meeting-list">
        {meetings.map((meeting) => (
          <article className={`assistant-meeting ${meeting.modalidad.toLowerCase()}`} key={meeting.id}>
            <time dateTime={meeting.inicioAt.toISOString()}>
              {dateFormatter.format(meeting.inicioAt).replace(" ", "\n")}
            </time>
            <div className="assistant-meeting-copy">
              <strong>{meeting.titulo}</strong>
              <small>{meeting.programa} · {meeting.docente}</small>
              <div className="meeting-detail-line">
                <span className={`modality modality-${meeting.modalidad.toLowerCase()}`}>
                  {meeting.modalidad === "HIBRIDA" ? "Híbrida" : "Virtual"}
                </span>
                <span><Clock3 size={14} />{timeFormatter.format(meeting.inicioAt)} ({formatMinutes(meeting.minutos)})</span>
              </div>
              {meeting.comentarioReporte ? (
                <p className="report-note"><MessageSquareText size={14} />{meeting.comentarioReporte}</p>
              ) : null}
            </div>
            <div className="assistant-meeting-actions">
              <span className={`status ${meeting.completada ? "status-ok" : "status-warning"}`}>
                {meeting.completada ? <CheckCircle2 size={14} /> : <Clock3 size={14} />}
                {meeting.completada ? "Completada" : "Pendiente"}
              </span>
              {meeting.completada ? (
                <button className="report-button" type="button" onClick={() => openReport(meeting)}>
                  <FilePenLine size={16} />
                  {meeting.cierreConfirmado ? "Ajustar cierre" : "Finalizar asistencia técnica"}
                </button>
              ) : null}
            </div>
          </article>
        ))}
      </div>

      {selected ? (
        <div className="dialog-backdrop" role="presentation" onMouseDown={closeReport}>
          <section className="duration-dialog" role="dialog" aria-modal="true" aria-labelledby="duration-title" onMouseDown={(event) => event.stopPropagation()}>
            <div>
              <p className="page-eyebrow">Cierre de asistencia técnica</p>
              <h2 id="duration-title">{selected.cierreConfirmado ? "Ajustar cierre" : "Finalizar asistencia técnica"}</h2>
              <p>Confirmá el horario real y registrá cualquier incidencia operativa.</p>
            </div>
            <form onSubmit={submitReport}>
              <div className="duration-time-grid">
                <label className="field">
                  <span>Inicio efectivo</span>
                  <input type="datetime-local" required value={actualStart} onChange={(event) => { const value = event.target.value; setActualStart(value); updateCalculatedMinutes(value, actualEnd, setMinutes); }} disabled={pending} />
                </label>
                <label className="field">
                  <span>Fin efectivo</span>
                  <input type="datetime-local" required value={actualEnd} onChange={(event) => { const value = event.target.value; setActualEnd(value); updateCalculatedMinutes(actualStart, value, setMinutes); }} disabled={pending} />
                </label>
              </div>
              <div className="duration-summary"><Clock3 size={16} /><span>Duración calculada</span><strong>{minutes ? formatMinutes(Number(minutes)) : "—"}</strong><small>Programada: {formatMinutes(selected.minutosProgramados)}</small></div>
              <label className="field">
                <span>Comentarios u observaciones</span>
                <textarea rows={3} maxLength={1000} value={comment} onChange={(event) => setComment(event.target.value)} placeholder="Ej.: la reunión se extendió por consultas." disabled={pending} />
              </label>
              <label className="incident-toggle">
                <input type="checkbox" checked={hasIncident} onChange={(event) => setHasIncident(event.target.checked)} disabled={pending} />
                <AlertTriangle size={17} />
                <span><strong>Hubo una incidencia</strong><small>Problemas de acceso, audio, grabación, asistencia técnica u otros.</small></span>
              </label>
              {hasIncident ? (
                <div className="incident-fields">
                  <label className="field"><span>Tipo</span><input required value={incidentType} maxLength={80} onChange={(event) => setIncidentType(event.target.value)} disabled={pending} /></label>
                  <label className="field"><span>Severidad</span><select value={incidentSeverity} onChange={(event) => setIncidentSeverity(event.target.value)} disabled={pending}><option value="BAJA">Baja</option><option value="MEDIA">Media</option><option value="ALTA">Alta</option><option value="CRITICA">Crítica</option></select></label>
                  <label className="field incident-description"><span>Descripción</span><textarea required rows={3} minLength={3} maxLength={1000} value={incidentDescription} onChange={(event) => setIncidentDescription(event.target.value)} disabled={pending} /></label>
                </div>
              ) : null}
              {error ? <p className="inline-error" role="alert">{error}</p> : null}
              <div className="dialog-actions">
                <button className="secondary-action" type="button" onClick={closeReport} disabled={pending}>Cancelar</button>
                <button className="primary-action" type="submit" disabled={pending}>{pending ? "Guardando…" : selected.cierreConfirmado ? "Guardar ajuste" : "Finalizar asistencia técnica"}</button>
              </div>
            </form>
          </section>
        </div>
      ) : null}
    </>
  );
}

function toMontevideoInput(date: Date): string {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: "America/Montevideo",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    hourCycle: "h23"
  }).formatToParts(date);
  const value = (type: Intl.DateTimeFormatPartTypes) => parts.find((part) => part.type === type)?.value ?? "";
  return `${value("year")}-${value("month")}-${value("day")}T${value("hour")}:${value("minute")}`;
}

function montevideoInputToIso(value: string): string {
  return new Date(`${value}:00-03:00`).toISOString();
}

function updateCalculatedMinutes(
  start: string,
  end: string,
  setMinutes: (value: string) => void
) {
  const minutes = Math.round((new Date(`${end}:00-03:00`).getTime() - new Date(`${start}:00-03:00`).getTime()) / 60_000);
  setMinutes(minutes > 0 ? String(minutes) : "");
}
