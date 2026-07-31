"use client";

import { CalendarDays, CalendarPlus, Check, Plus, Trash2 } from "lucide-react";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { generarFechasRecurrentes } from "@/src/modules/reuniones/recurrencia.domain";

type Option = Readonly<{ id: string; label: string }>;
type MeetingDate = Readonly<{ fecha: string; horaInicio: string; horaFin: string }>;
type RecurrenceState = Readonly<{
  desde: string;
  hasta: string;
  diasSemana: readonly number[];
  horaInicio: string;
  horaFin: string;
}>;

const WEEKDAYS = [
  { value: 1, label: "Lun" },
  { value: 2, label: "Mar" },
  { value: 3, label: "Mié" },
  { value: 4, label: "Jue" },
  { value: 5, label: "Vie" },
  { value: 6, label: "Sáb" },
  { value: 0, label: "Dom" }
] as const;

export function MeetingForm({
  programs,
  hosts,
  assistants,
  cohosts,
  canAssignAssistant
}: Readonly<{
  programs: readonly (Option & { teacher: string })[];
  hosts: readonly (Option & { email: string })[];
  assistants: readonly Option[];
  cohosts: readonly Readonly<{ id: string; email: string }>[];
  canAssignAssistant: boolean;
}>) {
  const router = useRouter();
  const [dates, setDates] = useState<readonly MeetingDate[]>([{ fecha: "", horaInicio: "", horaFin: "" }]);
  const [recurrence, setRecurrence] = useState<RecurrenceState>({
    desde: "",
    hasta: "",
    diasSemana: [],
    horaInicio: "",
    horaFin: ""
  });
  const [recurrenceMessage, setRecurrenceMessage] = useState("");
  const [requiresAssistance, setRequiresAssistance] = useState(false);
  const [assistanceMode, setAssistanceMode] = useState<"OPEN" | "ASSIGN">("OPEN");
  const [status, setStatus] = useState<"idle" | "saving" | "done" | "error">("idle");
  const [message, setMessage] = useState("");

  async function submit(formData: FormData) {
    setStatus("saving");
    setMessage("");
    const response = await fetch("/api/v1/reuniones", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        titulo: formData.get("titulo"),
        descripcion: formData.get("descripcion") || undefined,
        docenteProgramaId: formData.get("docenteProgramaId"),
        cuentaHostId: formData.get("cuentaHostId"),
        cohostCuentaIds: formData.getAll("cohostCuentaIds"),
        asistenteId: canAssignAssistant && assistanceMode === "ASSIGN"
          ? formData.get("asistenteId") || undefined
          : undefined,
        requiereAsistencia: formData.get("requiereAsistencia") === "on",
        requiereGrabacion: formData.get("requiereGrabacion") === "on",
        modalidad: formData.get("modalidad"),
        timezone: "America/Montevideo",
        instancias: dates.map(({ fecha, horaInicio, horaFin }) => ({
          inicio: localMontevideoToIso(fecha, horaInicio),
          fin: localMontevideoToIso(fecha, horaFin)
        }))
      })
    });
    const result = await response.json();
    if (!response.ok) {
      setStatus("error");
      setMessage(result.error ?? "No se pudo crear la reunión.");
      return;
    }
    const failures = result.provisionamiento?.filter(
      ({ estado }: { estado: string }) => estado !== "SINCRONIZADA"
    ).length;
    setStatus("done");
    setMessage(
      failures
        ? "La reunión quedó guardada y espera la configuración de Google."
        : "La reunión y su enlace Meet quedaron creados."
    );
    router.refresh();
  }

  function generateRecurrence() {
    try {
      const generated = generarFechasRecurrentes(recurrence);
      if (generated.length === 0) throw new Error("No hay fechas que coincidan con esa regla.");
      setDates(generated);
      setRecurrenceMessage(`${generated.length} fechas generadas.`);
    } catch (error) {
      setRecurrenceMessage(error instanceof Error ? error.message : "No se pudieron generar las fechas.");
    }
  }

  return (
    <form className="meeting-form" action={submit}>
      <FormSection number="1" title="Datos académicos" detail="Programa, docente y modalidad.">
        <div className="form-grid">
          <Field label="Título" wide><input name="titulo" required minLength={3} /></Field>
          <Field label="Programa y docente" wide>
            <select name="docenteProgramaId" required defaultValue={programs.length === 1 ? programs[0].id : ""}>
              <option value="" disabled>Seleccionar</option>
              {programs.map((option) => <option value={option.id} key={option.id}>{option.label} — {option.teacher}</option>)}
            </select>
          </Field>
          <Field label="Modalidad">
            <select name="modalidad" defaultValue="VIRTUAL"><option value="VIRTUAL">Virtual</option><option value="HIBRIDA">Híbrida</option></select>
          </Field>
          <Field label="Descripción" wide><textarea name="descripcion" rows={3} /></Field>
        </div>
      </FormSection>

      <FormSection number="2" title="Fechas" detail="Zona horaria de Montevideo.">
        <div className="date-list">
          <div className="recurrence-builder">
            <div className="recurrence-grid">
              <Field label="Desde"><input type="date" value={recurrence.desde} onChange={(event) => setRecurrence({ ...recurrence, desde: event.target.value })} /></Field>
              <Field label="Hasta"><input type="date" value={recurrence.hasta} onChange={(event) => setRecurrence({ ...recurrence, hasta: event.target.value })} /></Field>
              <Field label="Hora de inicio"><input type="time" value={recurrence.horaInicio} onChange={(event) => setRecurrence({ ...recurrence, horaInicio: event.target.value })} /></Field>
              <Field label="Hora de fin"><input type="time" value={recurrence.horaFin} onChange={(event) => setRecurrence({ ...recurrence, horaFin: event.target.value })} /></Field>
            </div>
            <fieldset className="weekday-selector">
              <legend>Días</legend>
              {WEEKDAYS.map((day) => (
                <label key={day.value}>
                  <input type="checkbox" checked={recurrence.diasSemana.includes(day.value)} onChange={(event) => setRecurrence({ ...recurrence, diasSemana: toggleWeekday(recurrence.diasSemana, day.value, event.target.checked) })} />
                  <span>{day.label}</span>
                </label>
              ))}
            </fieldset>
            <div className="recurrence-actions">
              <span className="muted-text" role="status">{recurrenceMessage}</span>
              <button className="secondary-action" type="button" onClick={generateRecurrence}><CalendarDays size={17} />Generar fechas</button>
            </div>
          </div>
          {dates.map((date, index) => (
            <div className="date-row" key={index}>
              <Field label="Fecha"><input type="date" required value={date.fecha} onChange={(event) => setDates(updateDate(dates, index, "fecha", event.target.value))} /></Field>
              <Field label="Hora de inicio"><input type="time" required value={date.horaInicio} onChange={(event) => setDates(updateDate(dates, index, "horaInicio", event.target.value))} /></Field>
              <Field label="Hora de fin"><input type="time" required value={date.horaFin} onChange={(event) => setDates(updateDate(dates, index, "horaFin", event.target.value))} /></Field>
              <button className="icon-button remove-date" type="button" title="Quitar fecha" disabled={dates.length === 1} onClick={() => setDates(dates.filter((_, current) => current !== index))}><Trash2 size={18} /><span className="sr-only">Quitar fecha</span></button>
            </div>
          ))}
          <button className="secondary-action add-date" type="button" onClick={() => setDates([...dates, { fecha: "", horaInicio: "", horaFin: "" }])}><Plus size={17} />Agregar fecha</button>
        </div>
      </FormSection>

      <FormSection number="3" title="Organización" detail="Host, asistencia y cohosts.">
        <div className="form-grid">
          <Field label="Cuenta host con licencia" wide>
            <select name="cuentaHostId" required defaultValue="">
              <option value="" disabled>Seleccionar sala</option>
              {hosts.map((host) => <option value={host.id} key={host.id}>{host.label} — {host.email}</option>)}
            </select>
          </Field>
          <label className="check-field"><input name="requiereAsistencia" type="checkbox" checked={requiresAssistance} onChange={(event) => setRequiresAssistance(event.target.checked)} /><span>Requiere asistencia</span></label>
          <label className="check-field"><input name="requiereGrabacion" type="checkbox" /><span>Requiere grabación</span></label>
          {requiresAssistance && canAssignAssistant ? (
            <fieldset className="field field-wide assistance-choice">
              <legend>Cobertura de asistencia</legend>
              <label><input type="radio" name="modoAsistencia" value="OPEN" checked={assistanceMode === "OPEN"} onChange={() => setAssistanceMode("OPEN")} /><span>Abierta a postulaciones</span></label>
              <label><input type="radio" name="modoAsistencia" value="ASSIGN" checked={assistanceMode === "ASSIGN"} onChange={() => setAssistanceMode("ASSIGN")} /><span>Asignar ahora</span></label>
            </fieldset>
          ) : null}
          {requiresAssistance && !canAssignAssistant ? (
            <div className="field field-wide"><span>Cobertura de asistencia</span><div><span className="status status-warning">Abierta a postulaciones</span></div></div>
          ) : null}
          {requiresAssistance && canAssignAssistant && assistanceMode === "ASSIGN" ? (
            <Field label="Asistente" wide>
              <select name="asistenteId" required defaultValue=""><option value="" disabled>Seleccionar asistente</option>{assistants.map((assistant) => <option value={assistant.id} key={assistant.id}>{assistant.label}</option>)}</select>
            </Field>
          ) : null}
          {cohosts.length ? (
            <fieldset className="field field-wide checkbox-list">
              <legend>Cohosts</legend>
              {cohosts.map((cohost) => <label key={cohost.id}><input type="checkbox" name="cohostCuentaIds" value={cohost.id} /><span>{cohost.email}</span></label>)}
            </fieldset>
          ) : null}
        </div>
      </FormSection>

      <footer className="form-actions">
        {message ? <p className={`form-message ${status}`}>{status === "done" ? <Check size={17} /> : null}{message}</p> : <span />}
        <button className="primary-action" type="submit" disabled={status === "saving"}><CalendarPlus size={18} />{status === "saving" ? "Creando…" : "Crear reunión"}</button>
      </footer>
    </form>
  );
}

function FormSection({ number, title, detail, children }: Readonly<{ number: string; title: string; detail: string; children: React.ReactNode }>) {
  return <section className="form-section"><div className="form-section-title"><span>{number}</span><div><h2>{title}</h2><p>{detail}</p></div></div>{children}</section>;
}

function Field({ label, wide = false, children }: Readonly<{ label: string; wide?: boolean; children: React.ReactNode }>) {
  return <label className={wide ? "field field-wide" : "field"}><span>{label}</span>{children}</label>;
}

function updateDate(dates: readonly MeetingDate[], index: number, key: keyof MeetingDate, value: string): readonly MeetingDate[] {
  return dates.map((date, current) => current === index ? { ...date, [key]: value } : date);
}

function toggleWeekday(days: readonly number[], day: number, checked: boolean): readonly number[] {
  return checked ? [...days, day] : days.filter((value) => value !== day);
}

function localMontevideoToIso(fecha: string, hora: string): string {
  return new Date(`${fecha}T${hora}:00-03:00`).toISOString();
}
