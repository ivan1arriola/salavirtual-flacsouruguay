"use client";

import { CheckCircle2, Clock3, FilePenLine, MessageSquareText } from "lucide-react";
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
  const [comment, setComment] = useState("");
  const [pending, setPending] = useState(false);
  const [error, setError] = useState("");

  function openReport(meeting: RegistroAsistenciaPersonal) {
    setSelected(meeting);
    setMinutes(String(meeting.minutosReportados ?? meeting.minutosProgramados));
    setComment(meeting.comentarioReporte ?? "");
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
        minutos: Number(minutes),
        comentario: comment || undefined
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
                  {meeting.minutosReportados === null ? "Informar duración" : "Ajustar reporte"}
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
              <p className="page-eyebrow">Asistencia completada</p>
              <h2 id="duration-title">Informar duración real</h2>
              <p>Indicá cuánto duró la reunión para ajustar la estimación.</p>
            </div>
            <form onSubmit={submitReport}>
              <label className="field">
                <span>Duración real en minutos</span>
                <input type="number" min={1} max={1440} required value={minutes} onChange={(event) => setMinutes(event.target.value)} disabled={pending} />
                <small>Programada: {formatMinutes(selected.minutosProgramados)}</small>
              </label>
              <label className="field">
                <span>Comentarios u observaciones</span>
                <textarea rows={3} maxLength={1000} value={comment} onChange={(event) => setComment(event.target.value)} placeholder="Ej.: la reunión se extendió por consultas." disabled={pending} />
              </label>
              {error ? <p className="inline-error" role="alert">{error}</p> : null}
              <div className="dialog-actions">
                <button className="secondary-action" type="button" onClick={closeReport} disabled={pending}>Cancelar</button>
                <button className="primary-action" type="submit" disabled={pending}>{pending ? "Guardando…" : "Guardar reporte"}</button>
              </div>
            </form>
          </section>
        </div>
      ) : null}
    </>
  );
}
