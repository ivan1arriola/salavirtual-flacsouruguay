"use client";

import {
  BookOpen,
  CalendarDays,
  CalendarPlus,
  CheckCircle2,
  ChevronDown,
  LoaderCircle,
  Mail,
  Plus,
  ShieldCheck,
  Trash2,
  UserRoundCheck,
  UsersRound
} from "lucide-react";
import { type FormEvent, useRef, useState } from "react";
import { MeetingCreationDialog } from "./meeting-creation-dialog";
import { generarFechasRecurrentes } from "@/src/modules/reuniones/recurrencia.domain";

type Option = Readonly<{ id: string; label: string }>;
type ProgramOption = Option & Readonly<{ teacher: string; teacherEmail?: string }>;
type MeetingDate = Readonly<{
  fecha: string;
  horaInicio: string;
  horaFin: string;
  horaAsistenciaInicio: string;
  horaAsistenciaFin: string;
  descripcion: string;
}>;
type MeetingDateMode = "SINGLE" | "RECURRENT" | "MANUAL";
type RecurrenceState = Readonly<{
  desde: string;
  hasta: string;
  diasSemana: readonly number[];
  horaInicio: string;
  horaFin: string;
  horaAsistenciaInicio: string;
  horaAsistenciaFin: string;
}>;

type EmailEditorProps = Readonly<{
  title: string;
  detail: string;
  emails: readonly string[];
  otherEmails: readonly string[];
  teacherEmail?: string;
  googleOnly?: boolean;
  placeholder: string;
  addLabel: string;
  onChange: (emails: readonly string[]) => void;
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

const EMPTY_DATE: MeetingDate = {
  fecha: "",
  horaInicio: "",
  horaFin: "",
  horaAsistenciaInicio: "",
  horaAsistenciaFin: "",
  descripcion: ""
};

export function MeetingFormV2({
  programs,
  assistants,
  canAssignAssistant
}: Readonly<{
  programs: readonly ProgramOption[];
  assistants: readonly Option[];
  canAssignAssistant: boolean;
}>) {
  const [selectedProgramId, setSelectedProgramId] = useState<string>(programs.length === 1 ? programs[0].id : "");
  const [title, setTitle] = useState("");
  const [dates, setDates] = useState<readonly MeetingDate[]>([EMPTY_DATE]);
  const [dateMode, setDateMode] = useState<MeetingDateMode>("SINGLE");
  const [recurrence, setRecurrence] = useState<RecurrenceState>({
    desde: "",
    hasta: "",
    diasSemana: [],
    horaInicio: "",
    horaFin: "",
    horaAsistenciaInicio: "",
    horaAsistenciaFin: ""
  });
  const [recurrenceMessage, setRecurrenceMessage] = useState("");
  const [recurrenceGenerated, setRecurrenceGenerated] = useState(false);
  const [meetingMode, setMeetingMode] = useState<"VIRTUAL" | "HIBRIDA">("VIRTUAL");
  const [requiresAssistance, setRequiresAssistance] = useState(false);
  const [requiresRecording, setRequiresRecording] = useState(false);
  const [assistanceMode, setAssistanceMode] = useState<"OPEN" | "ASSIGN">("OPEN");
  const [extraCohostEmails, setExtraCohostEmails] = useState<readonly string[]>([]);
  const [guestEmails, setGuestEmails] = useState<readonly string[]>([]);
  const [status, setStatus] = useState<"idle" | "saving" | "done" | "error">("idle");
  const [message, setMessage] = useState("");
  const [createdMeetingId, setCreatedMeetingId] = useState<string>();
  const submittingRef = useRef(false);
  const idempotencyKeyRef = useRef<string>("");
  const recurrenceReviewRef = useRef<HTMLDivElement>(null);

  const selectedProgram = programs.find((program) => program.id === selectedProgramId);
  const academicReady = title.trim().length >= 3 && Boolean(selectedProgram?.teacherEmail);
  const datesReady = dates.length > 0 && dates.every((date) =>
    Boolean(date.fecha && date.horaInicio && date.horaFin && date.horaFin > date.horaInicio) &&
    (meetingMode !== "HIBRIDA" || !requiresAssistance || Boolean(
      date.horaAsistenciaInicio && date.horaAsistenciaFin && date.horaAsistenciaFin > date.horaAsistenciaInicio
    ))
  );
  const isReady = academicReady && datesReady;

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (submittingRef.current) return;
    if (!selectedProgram) {
      setStatus("error");
      setMessage("Seleccioná el programa y docente antes de crear la reunión.");
      return;
    }
    if (!selectedProgram.teacherEmail) {
      setStatus("error");
      setMessage("El docente seleccionado no tiene una cuenta Google configurada para usar como cohost.");
      return;
    }
    if (!datesReady) {
      setStatus("error");
      setMessage("Revisá las fechas y horarios: cada encuentro necesita un horario válido y, si corresponde, el horario de asistencia técnica.");
      document.getElementById("fechas")?.scrollIntoView({ behavior: "smooth", block: "start" });
      return;
    }

    submittingRef.current = true;
    idempotencyKeyRef.current ||= window.crypto.randomUUID();
    const formData = new FormData(event.currentTarget);
    setStatus("saving");
    setMessage("");
    try {
      await waitForNextPaint();
      const minimumLoadingTime = wait(800);
      const response = await fetch("/api/v1/reuniones", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "Idempotency-Key": idempotencyKeyRef.current
        },
        body: JSON.stringify({
          titulo: formData.get("titulo"),
          descripcion: formData.get("descripcion") || undefined,
          docenteProgramaId: selectedProgramId,
          cohostEmailsManual: extraCohostEmails,
          invitadosEmails: guestEmails,
          asistenteTecnicoId: canAssignAssistant && requiresAssistance && assistanceMode === "ASSIGN"
            ? formData.get("asistenteTecnicoId") || undefined
            : undefined,
          requiereAsistenciaTecnica: requiresAssistance,
          requiereGrabacion: requiresRecording,
          modalidad: formData.get("modalidad"),
          timezone: "America/Montevideo",
          instancias: dates.map(({
            fecha,
            horaInicio,
            horaFin,
            horaAsistenciaInicio,
            horaAsistenciaFin,
            descripcion
          }) => ({
            inicio: localMontevideoToIso(fecha, horaInicio),
            fin: localMontevideoToIso(fecha, horaFin),
            asistenciaInicio: meetingMode === "HIBRIDA" && requiresAssistance
              ? localMontevideoToIso(fecha, horaAsistenciaInicio)
              : undefined,
            asistenciaFin: meetingMode === "HIBRIDA" && requiresAssistance
              ? localMontevideoToIso(fecha, horaAsistenciaFin)
              : undefined,
            descripcion: descripcion || undefined
          }))
        })
      });
      const result = await response.json();
      if (!response.ok) throw new Error(result.error ?? "No se pudo crear la reunión.");
      await minimumLoadingTime;
      const failures = result.provisionamiento?.filter(
        ({ estado }: { estado: string }) => estado !== "SINCRONIZADA"
      ).length;
      setCreatedMeetingId(result.solicitudId);
      setStatus("done");
      setMessage(
        result.reutilizada
          ? "Esta reunión ya se estaba creando. Se conservó una única solicitud."
          : failures
            ? "La reunión quedó guardada. La configuración de Google continúa pendiente."
            : "La reunión y sus enlaces de Google Meet quedaron creados correctamente."
      );
    } catch (error) {
      submittingRef.current = false;
      setStatus("error");
      setMessage(error instanceof Error ? error.message : "No se pudo crear la reunión.");
    }
  }

  function generateRecurrence() {
    try {
      const generated = generarFechasRecurrentes(recurrence);
      if (generated.length === 0) throw new Error("No hay fechas que coincidan con esa regla.");
      setDates(generated.map((date) => ({
        ...date,
        horaAsistenciaInicio: recurrence.horaAsistenciaInicio,
        horaAsistenciaFin: recurrence.horaAsistenciaFin,
        descripcion: ""
      })));
      setRecurrenceGenerated(true);
      setRecurrenceMessage(`${generated.length} ${generated.length === 1 ? "encuentro generado" : "encuentros generados"}. Revisá la vista previa.`);
      window.requestAnimationFrame(() => {
        window.requestAnimationFrame(() => recurrenceReviewRef.current?.scrollIntoView({ behavior: "smooth", block: "nearest" }));
      });
    } catch (error) {
      setRecurrenceMessage(error instanceof Error ? error.message : "No se pudieron generar las fechas.");
    }
  }

  function setMeetingDateMode(mode: MeetingDateMode) {
    setDateMode(mode);
    setRecurrenceMessage("");
    setRecurrenceGenerated(false);
    if (mode === "SINGLE") setDates([dates[0] ?? EMPTY_DATE]);
    else if (mode === "RECURRENT") setDates([]);
    else if (dates.length === 0) setDates([EMPTY_DATE]);
  }

  return (
    <form className="meeting-form meeting-form-v2" onSubmit={submit} aria-busy={status === "saving"}>
      <nav className="meeting-form-steps" aria-label="Secciones del formulario">
        <a className={academicReady ? "is-complete" : ""} href="#datos-academicos" aria-label={academicReady ? "Datos académicos completos" : "Ir a datos académicos"}><span>{academicReady ? <CheckCircle2 size={17} aria-hidden="true" /> : "1"}</span><div><strong>Datos</strong><small>Programa y título</small></div></a>
        <a className={datesReady ? "is-complete" : ""} href="#fechas" aria-label={datesReady ? "Fechas completas" : "Ir a fechas"}><span>{datesReady ? <CheckCircle2 size={17} aria-hidden="true" /> : "2"}</span><div><strong>Fechas</strong><small>Encuentros</small></div></a>
        <a href="#organizacion" aria-label="Ir a organización y accesos"><span>3</span><div><strong>Accesos</strong><small>Organización</small></div></a>
      </nav>

      <FormSection id="datos-academicos" icon={<BookOpen size={19} />} number="1" title="Datos académicos" detail="Identificá la reunión y vinculala al programa correspondiente.">
        <div className="form-grid">
          <Field label="Título"><input name="titulo" value={title} onChange={(event) => setTitle(event.target.value)} placeholder="Ej. Seminario de metodología" required minLength={3} autoComplete="off" /></Field>
          <Field label="Programa y docente">
            <select name="docenteProgramaId" required value={selectedProgramId} onChange={(event) => setSelectedProgramId(event.target.value)}>
              <option value="" disabled>Seleccionar</option>
              {programs.map((option) => <option value={option.id} key={option.id}>{option.label} — {option.teacher}</option>)}
            </select>
          </Field>
          <fieldset className="field field-wide modality-choice">
            <legend>Modalidad</legend>
            <label><input type="radio" name="modalidad" value="VIRTUAL" checked={meetingMode === "VIRTUAL"} onChange={() => setMeetingMode("VIRTUAL")} /><span className="option-copy"><strong>Virtual</strong><small>Todos participan por Google Meet</small></span></label>
            <label><input type="radio" name="modalidad" value="HIBRIDA" checked={meetingMode === "HIBRIDA"} onChange={() => setMeetingMode("HIBRIDA")} /><span className="option-copy"><strong>Híbrida</strong><small>Combina participación presencial y remota</small></span></label>
          </fieldset>
          <Field label="Descripción general (opcional)" wide><textarea name="descripcion" placeholder="Contexto común a toda la serie" rows={3} /></Field>
        </div>
      </FormSection>

      <FormSection id="fechas" icon={<CalendarDays size={19} />} number="2" title="Fechas" detail="Todos los horarios se interpretan en UTC-3 · Montevideo.">
        <fieldset className="date-mode-selector">
          <legend>¿Cómo querés definir las fechas?</legend>
          <label><input type="radio" name="dateMode" value="SINGLE" checked={dateMode === "SINGLE"} onChange={() => setMeetingDateMode("SINGLE")} /><span className="option-copy"><strong>Una fecha</strong><small>Un único encuentro</small></span></label>
          <label><input type="radio" name="dateMode" value="RECURRENT" checked={dateMode === "RECURRENT"} onChange={() => setMeetingDateMode("RECURRENT")} /><span className="option-copy"><strong>Repetición semanal</strong><small>Elegí un período, días y horario</small></span></label>
          <label><input type="radio" name="dateMode" value="MANUAL" checked={dateMode === "MANUAL"} onChange={() => setMeetingDateMode("MANUAL")} /><span className="option-copy"><strong>Fechas específicas</strong><small>Cargá cada encuentro por separado</small></span></label>
        </fieldset>
        <div className="date-list">
          {dateMode === "RECURRENT" ? (
            <div className="recurrence-builder">
              <div className="recurrence-guidance"><strong>1. Definí la repetición</strong><span>Indicá el período, el horario común y los días de la semana.</span></div>
              <div className="recurrence-grid">
                <Field label="Fecha inicial"><input type="date" value={recurrence.desde} onChange={(event) => setRecurrence({ ...recurrence, desde: event.target.value })} /></Field>
                <Field label="Fecha final"><input type="date" value={recurrence.hasta} onChange={(event) => setRecurrence({ ...recurrence, hasta: event.target.value })} /></Field>
                <Field label="Hora de inicio"><input type="time" value={recurrence.horaInicio} onChange={(event) => setRecurrence({ ...recurrence, horaInicio: event.target.value })} /></Field>
                <Field label="Hora de fin"><input type="time" value={recurrence.horaFin} onChange={(event) => setRecurrence({ ...recurrence, horaFin: event.target.value })} /></Field>
                {meetingMode === "HIBRIDA" ? (
                  <>
                    <Field label="Llegada del asistente"><input type="time" required={requiresAssistance} value={recurrence.horaAsistenciaInicio} onChange={(event) => setRecurrence({ ...recurrence, horaAsistenciaInicio: event.target.value })} /></Field>
                    <Field label="Salida del asistente"><input type="time" required={requiresAssistance} value={recurrence.horaAsistenciaFin} onChange={(event) => setRecurrence({ ...recurrence, horaAsistenciaFin: event.target.value })} /></Field>
                  </>
                ) : null}
              </div>
              <fieldset className="weekday-selector">
                <legend>Días de la semana</legend>
                {WEEKDAYS.map((day) => (
                  <label key={day.value}>
                    <input type="checkbox" checked={recurrence.diasSemana.includes(day.value)} onChange={(event) => setRecurrence({ ...recurrence, diasSemana: toggleWeekday(recurrence.diasSemana, day.value, event.target.checked) })} />
                    <span>{day.label}</span>
                  </label>
                ))}
              </fieldset>
              <div className="recurrence-actions">
                <span className={recurrenceMessage ? "recurrence-feedback has-result" : "recurrence-feedback"} role="status">{recurrenceMessage || "Luego podrás revisar y ajustar cada encuentro."}</span>
                <button className="secondary-action" type="button" onClick={generateRecurrence}><CalendarDays size={17} />Generar vista previa</button>
              </div>
            </div>
          ) : null}
          {dateMode === "MANUAL" || recurrenceGenerated ? (
            <div className={dateMode === "RECURRENT" ? "generated-dates-heading recurrence-review-heading" : "generated-dates-heading"} ref={dateMode === "RECURRENT" ? recurrenceReviewRef : undefined}>
              <div><strong>{dateMode === "RECURRENT" ? "2. Revisá y ajustá los encuentros" : "Fechas cargadas manualmente"}</strong>{dateMode === "RECURRENT" ? <small>Podés cambiar fechas y horarios, quitar encuentros o agregar excepciones.</small> : null}</div>
              <span className="date-count">{dates.length}</span>
            </div>
          ) : null}
          {dateMode !== "RECURRENT" || recurrenceGenerated ? (
            <>
              <div className={`date-rows${dates.length > 5 ? " is-scrollable" : ""}`}>
                {dates.map((date, index) => (
                  <div className={dateMode === "SINGLE" ? "date-row date-row-single" : "date-row"} key={index}>
                    {dateMode !== "SINGLE" ? <span className="date-row-number" aria-hidden="true">{index + 1}</span> : null}
                    <Field label="Fecha"><input type="date" required value={date.fecha} onChange={(event) => setDates(updateDate(dates, index, "fecha", event.target.value))} /></Field>
                    <Field label="Hora de inicio"><input type="time" required value={date.horaInicio} onChange={(event) => setDates(updateDate(dates, index, "horaInicio", event.target.value))} /></Field>
                    <Field label="Hora de fin"><input type="time" required value={date.horaFin} onChange={(event) => setDates(updateDate(dates, index, "horaFin", event.target.value))} /></Field>
                    {meetingMode === "HIBRIDA" ? (
                      <>
                        <Field label="Llegada asistente"><input type="time" required={requiresAssistance} value={date.horaAsistenciaInicio} onChange={(event) => setDates(updateDate(dates, index, "horaAsistenciaInicio", event.target.value))} /></Field>
                        <Field label="Salida asistente"><input type="time" required={requiresAssistance} value={date.horaAsistenciaFin} onChange={(event) => setDates(updateDate(dates, index, "horaAsistenciaFin", event.target.value))} /></Field>
                      </>
                    ) : null}
                    {dateMode !== "SINGLE" ? <button className="icon-button remove-date" type="button" title={`Quitar encuentro ${index + 1}`} onClick={() => setDates(dates.filter((_, current) => current !== index))}><Trash2 size={18} /><span className="sr-only">Quitar encuentro {index + 1}</span></button> : null}
                    <details className="meeting-date-notes" key={dateMode + "-" + index + "-notes"} defaultOpen={Boolean(date.descripcion)}>
                      <summary><Plus size={15} aria-hidden="true" /> Notas del encuentro <span>(opcional)</span></summary>
                      <label className="field date-description"><span>Descripción de este encuentro</span><textarea rows={2} value={date.descripcion} placeholder="Si queda vacía, se usará la descripción general" onChange={(event) => setDates(updateDate(dates, index, "descripcion", event.target.value))} /></label>
                    </details>
                    {date.horaInicio && date.horaFin && date.horaFin <= date.horaInicio ? <p className="meeting-date-warning" role="status">La hora de fin debe ser posterior a la de inicio.</p> : null}
                    {meetingMode === "HIBRIDA" && requiresAssistance && date.horaAsistenciaInicio && date.horaAsistenciaFin && date.horaAsistenciaFin <= date.horaAsistenciaInicio ? <p className="meeting-date-warning" role="status">La salida del asistente debe ser posterior a la llegada.</p> : null}
                  </div>
                ))}
              </div>
              {dateMode !== "SINGLE" ? <button className="secondary-action add-date" type="button" onClick={() => setDates([...dates, EMPTY_DATE])}><Plus size={17} />{dateMode === "RECURRENT" ? "Agregar encuentro a la serie" : "Agregar otra fecha"}</button> : null}
            </>
          ) : null}
        </div>
      </FormSection>

      <FormSection id="organizacion" icon={<UsersRound size={19} />} number="3" title="Organización y accesos" detail="Definí quién ingresa a la reunión, si requiere apoyo técnico y si debe grabarse.">
        <div className="organization-v2">
          <section className="organization-support-grid" aria-label="Soporte y grabación">
            <ChoicePanel
              title="Asistencia técnica"
              detail="¿Necesitás que un asistente técnico participe?"
              name="requiereAsistenciaTecnica"
              value={requiresAssistance}
              noLabel="No requiere"
              noDetail="La reunión puede realizarse sin asistencia."
              yesLabel="Sí, solicitar"
              yesDetail="Se asignará un asistente técnico como cohost."
              onChange={setRequiresAssistance}
            />
            <ChoicePanel
              title="Grabación"
              detail="¿La reunión debe quedar grabada?"
              name="requiereGrabacion"
              value={requiresRecording}
              noLabel="No grabar"
              noDetail="No se solicitará grabación del encuentro."
              yesLabel="Sí, grabar"
              yesDetail="El encuentro deberá grabarse."
              onChange={setRequiresRecording}
            />
          </section>

          {requiresAssistance ? (
            <section className="organization-subsection organization-assistance-config">
              <div className="organization-subsection-heading"><div><h3>Cobertura de asistencia técnica</h3><p>{meetingMode === "HIBRIDA" ? "El horario presencial se define por fecha: llegada antes del inicio y salida después del cierre." : "Definí si queda abierta a postulaciones o si querés asignar a alguien ahora."}</p></div></div>
              {canAssignAssistant ? (
                <fieldset className="assistance-choice organization-assistance-choice">
                  <label><input type="radio" name="modoAsistencia" value="OPEN" checked={assistanceMode === "OPEN"} onChange={() => setAssistanceMode("OPEN")} /><span className="option-copy"><strong>Abierta a postulaciones</strong><small>Los asistentes disponibles podrán ofrecerse</small></span></label>
                  <label className={assistants.length === 0 ? "is-disabled" : ""}><input type="radio" name="modoAsistencia" value="ASSIGN" disabled={assistants.length === 0} checked={assistanceMode === "ASSIGN"} onChange={() => setAssistanceMode("ASSIGN")} /><span className="option-copy"><strong>Asignar ahora</strong><small>{assistants.length > 0 ? `${assistants.length} asistentes disponibles` : "No hay asistentes disponibles"}</small></span></label>
                </fieldset>
              ) : <span className="status status-warning">Abierta a postulaciones</span>}
              {canAssignAssistant && assistanceMode === "ASSIGN" ? (
                <Field label="Asistente técnico"><select name="asistenteTecnicoId" required defaultValue=""><option value="" disabled>Seleccionar asistente técnico</option>{assistants.map((assistant) => <option value={assistant.id} key={assistant.id}>{assistant.label}</option>)}</select></Field>
              ) : null}
            </section>
          ) : null}

          <section className="organization-subsection organization-access-section">
            <div className="organization-subsection-heading">
              <div><h3>Quién va a ingresar a la reunión</h3><p>El docente del programa se agrega siempre como cohost. Podés sumar otras cuentas Google.</p></div>
            </div>
            <div className="organization-access-note"><ShieldCheck size={19} aria-hidden="true" /><div><strong>El docente se agrega automáticamente como cohost.</strong><span>La cuenta organizadora es solo técnica y no se usa para iniciar sesión.</span></div></div>
            <div className="teacher-cohost-card">
              <span className="teacher-cohost-check"><UserRoundCheck size={18} /></span>
              <div><small>Docente del programa · cohost automático</small><strong>{selectedProgram?.teacher ?? "Seleccioná un programa"}</strong><span>{selectedProgram?.teacherEmail ?? "Sin cuenta Google configurada"}</span></div>
              <span className="teacher-cohost-badge">Incluido</span>
            </div>
          </section>

          <EmailListEditor
            title="Cohosts adicionales"
            detail="Agregá una o varias cuentas Google: Gmail o Google Workspace."
            emails={extraCohostEmails}
            otherEmails={guestEmails}
            teacherEmail={selectedProgram?.teacherEmail}
            googleOnly
            placeholder="cuenta@gmail.com o usuario@dominio.com"
            addLabel="Agregar cohost"
            onChange={setExtraCohostEmails}
          />

          <EmailListEditor
            title="Invitados"
            detail="Reciben la invitación y el enlace de Meet, pero no tienen permisos de cohost."
            emails={guestEmails}
            otherEmails={extraCohostEmails}
            teacherEmail={selectedProgram?.teacherEmail}
            placeholder="persona@dominio.com"
            addLabel="Agregar invitado"
            onChange={setGuestEmails}
          />
        </div>
      </FormSection>

      <footer className="form-actions meeting-form-actions-v2">
        {status === "saving" ? <p className="form-message saving" role="status">Creando la reunión y configurando Google Meet…</p> : null}
        {status === "error" ? <p className="form-message" role="alert">{message}</p> : null}
        {status !== "saving" && status !== "error" ? (
          <div className="meeting-form-summary-v2" role="status" aria-live="polite">
            <strong>{dates.length} {dates.length === 1 ? "encuentro" : "encuentros"}</strong>
            <span>{isReady ? "Listo para crear" : !selectedProgram ? "Elegí un programa" : !selectedProgram.teacherEmail ? "Revisá la cuenta del docente" : !academicReady ? "Completá el título" : "Revisá fechas y horarios"}</span>
            <small>{requiresAssistance ? "Con asistencia" : "Sin asistencia"} · {requiresRecording ? "Se graba" : "Sin grabación"} · {extraCohostEmails.length} cohosts extra · {guestEmails.length} invitados</small>
          </div>
        ) : null}
        <button className="primary-action" type="submit" disabled={dates.length === 0 || status === "saving" || status === "done"}>
          {status === "saving" ? <LoaderCircle className="button-spinner" size={18} /> : <CalendarPlus size={18} />}
          {status === "saving" ? "Creando reunión…" : dates.length === 0 ? "Definí las fechas" : `Crear ${dates.length === 1 ? "reunión" : `${dates.length} encuentros`}`}
        </button>
      </footer>

      {status === "saving" || status === "done" ? <MeetingCreationDialog state={status} message={message} meetingId={createdMeetingId} meetingCount={dates.length} /> : null}
    </form>
  );
}

function ChoicePanel({
  title,
  detail,
  name,
  value,
  noLabel,
  noDetail,
  yesLabel,
  yesDetail,
  onChange
}: Readonly<{
  title: string;
  detail: string;
  name: string;
  value: boolean;
  noLabel: string;
  noDetail: string;
  yesLabel: string;
  yesDetail: string;
  onChange: (value: boolean) => void;
}>) {
  return (
    <div className="organization-choice-panel">
      <h3>{title}</h3><p>{detail}</p>
      <div className="organization-segmented">
        <label className={!value ? "is-selected" : ""}><input type="radio" name={name} checked={!value} onChange={() => onChange(false)} /><span><strong>{noLabel}</strong><small>{noDetail}</small></span></label>
        <label className={value ? "is-selected" : ""}><input type="radio" name={name} checked={value} onChange={() => onChange(true)} /><span><strong>{yesLabel}</strong><small>{yesDetail}</small></span></label>
      </div>
    </div>
  );
}

function EmailListEditor({
  title,
  detail,
  emails,
  otherEmails,
  teacherEmail,
  googleOnly = false,
  placeholder,
  addLabel,
  onChange
}: EmailEditorProps) {
  const [draft, setDraft] = useState("");
  const [error, setError] = useState("");

  function addEmail() {
    const email = draft.trim().toLowerCase();
    setError("");
    if (!email) return setError("Ingresá un correo.");
    if (!isValidEmail(email)) return setError("Ingresá un correo válido.");
    if (teacherEmail?.trim().toLowerCase() === email) return setError("El docente ya está incluido automáticamente como cohost.");
    if (emails.includes(email)) return setError("Ese correo ya fue agregado.");
    if (otherEmails.includes(email)) return setError(`Ese correo ya está agregado como ${googleOnly ? "invitado" : "cohost"}.`);
    onChange([...emails, email]);
    setDraft("");
  }

  return (
    <details className="organization-subsection organization-email-editor">
      <summary className="organization-subsection-heading">
        <div><h3>{title} <span>(opcional)</span></h3><p>{detail}</p></div>
        <span className="organization-count-pill">{emails.length} {emails.length === 1 ? (googleOnly ? "adicional" : "invitado") : (googleOnly ? "adicionales" : "invitados")}</span>
        <ChevronDown size={18} aria-hidden="true" className="organization-disclosure-chevron" />
      </summary>
      <div className="organization-email-content">
      {googleOnly ? (
        <div className="organization-google-warning"><ShieldCheck size={17} /><div><strong>Debe ser una cuenta Google</strong><span>El correo tiene que estar asociado a Gmail o Google Workspace. Si no es una cuenta Google, no podrá configurarse como cohost.</span></div></div>
      ) : (
        <div className="organization-guest-note"><Mail size={17} /><div><strong>Puede ser cualquier correo electrónico válido</strong><span>No es necesario que sea una cuenta Google ni que pertenezca a flacso.edu.uy.</span></div></div>
      )}
      <div className="organization-email-add-row">
        <input type="email" value={draft} placeholder={placeholder} aria-label={`Correo para ${title.toLowerCase()}`} autoComplete="email" onChange={(event) => setDraft(event.target.value)} onKeyDown={(event) => { if (event.key === "Enter") { event.preventDefault(); addEmail(); } }} />
        <button className="secondary-action" type="button" onClick={addEmail}><Plus size={16} />{addLabel}</button>
      </div>
      <span className="organization-email-error" role="status">{error}</span>
      {emails.length ? <div className="organization-email-chips">{emails.map((email) => <span key={email}><strong>{email}</strong><button type="button" onClick={() => onChange(emails.filter((value) => value !== email))} aria-label={`Quitar ${email}`}>×</button></span>)}</div> : null}
      </div>
    </details>
  );
}

function FormSection({ id, icon, number, title, detail, children }: Readonly<{ id: string; icon: React.ReactNode; number: string; title: string; detail: string; children: React.ReactNode }>) {
  return <section className="form-section" id={id}><div className="form-section-title"><span>{icon}</span><div><p>Paso {number}</p><h2>{title}</h2><small>{detail}</small></div></div>{children}</section>;
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

function isValidEmail(email: string): boolean {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
}

function localMontevideoToIso(fecha: string, hora: string): string {
  return new Date(`${fecha}T${hora}:00-03:00`).toISOString();
}

function wait(milliseconds: number): Promise<void> {
  return new Promise((resolve) => window.setTimeout(resolve, milliseconds));
}

function waitForNextPaint(): Promise<void> {
  return new Promise((resolve) => window.requestAnimationFrame(() => window.requestAnimationFrame(() => resolve())));
}
