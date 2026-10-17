"use client";

import {
  BookOpen,
  CalendarDays,
  CalendarPlus,
  ChevronDown,
  LoaderCircle,
  Plus,
  Trash2,
  UsersRound,
  Video
} from "lucide-react";
import { type FormEvent, useRef, useState } from "react";
import { MeetingCreationDialog } from "./meeting-creation-dialog";
import { generarFechasRecurrentes } from "@/src/modules/reuniones/recurrencia.domain";

type Option = Readonly<{ id: string; label: string }>;
type MeetingDate = Readonly<{
  fecha: string;
  horaInicio: string;
  horaFin: string;
  descripcion: string;
}>;
type MeetingDateMode = "SINGLE" | "RECURRENT" | "MANUAL";
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

const EMPTY_DATE: MeetingDate = { fecha: "", horaInicio: "", horaFin: "", descripcion: "" };

export function MeetingForm({
  programs,
  assistants,
  cohosts,
  canAssignAssistant,
  currentUser
}: Readonly<{
  programs: readonly (Option & { teacher: string; teacherEmail?: string })[];
  assistants: readonly Option[];
  cohosts: readonly Readonly<{ id: string; email: string }>[];
  canAssignAssistant: boolean;
  currentUser?: Readonly<{ id: string; email?: string | null; rol: string }>;
}>) {
  const [selectedProgramId, setSelectedProgramId] = useState<string>(programs.length === 1 ? programs[0].id : "");
  const [hostTipo, setHostTipo] = useState<"DOCENTE" | "OTRA_CUENTA" | "OTRO_CORREO">("DOCENTE");
  const [hostCuentaId, setHostCuentaId] = useState<string>("");
  const [hostEmail, setHostEmail] = useState<string>("");
  const [dates, setDates] = useState<readonly MeetingDate[]>([EMPTY_DATE]);
  const [dateMode, setDateMode] = useState<MeetingDateMode>("SINGLE");
  const [recurrence, setRecurrence] = useState<RecurrenceState>({
    desde: "",
    hasta: "",
    diasSemana: [],
    horaInicio: "",
    horaFin: ""
  });
  const [recurrenceMessage, setRecurrenceMessage] = useState("");
  const [recurrenceGenerated, setRecurrenceGenerated] = useState(false);
  const [requiresAssistance, setRequiresAssistance] = useState(false);
  const [assistanceMode, setAssistanceMode] = useState<"OPEN" | "ASSIGN">("OPEN");
  const [status, setStatus] = useState<"idle" | "saving" | "done" | "error">("idle");
  const [message, setMessage] = useState("");
  const [createdMeetingId, setCreatedMeetingId] = useState<string>();
  const submittingRef = useRef(false);
  const idempotencyKeyRef = useRef<string>("");
  const recurrenceReviewRef = useRef<HTMLDivElement>(null);

  const selectedProgram = programs.find((p) => p.id === selectedProgramId);

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (submittingRef.current) return;

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
          docenteProgramaId: formData.get("docenteProgramaId"),
          hostTipo: !requiresAssistance ? hostTipo : undefined,
          hostCuentaId: !requiresAssistance && hostTipo === "OTRA_CUENTA" ? hostCuentaId || undefined : undefined,
          hostEmail: !requiresAssistance && hostTipo === "OTRO_CORREO" ? hostEmail || undefined : undefined,
          cohostCuentaIds: !requiresAssistance ? formData.getAll("cohostCuentaIds") : [],
          cohostEmailsManual: !requiresAssistance ? formData.get("cohostEmailsManual") : undefined,
          asistenteTecnicoId: canAssignAssistant && requiresAssistance && assistanceMode === "ASSIGN"
            ? formData.get("asistenteTecnicoId") || undefined
            : undefined,
          requiereAsistenciaTecnica: requiresAssistance,
          requiereGrabacion: formData.get("requiereGrabacion") === "on",
          modalidad: formData.get("modalidad"),
          timezone: "America/Montevideo",
          instancias: dates.map(({ fecha, horaInicio, horaFin, descripcion }) => ({
            inicio: localMontevideoToIso(fecha, horaInicio),
            fin: localMontevideoToIso(fecha, horaFin),
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
      setDates(generated.map((date) => ({ ...date, descripcion: "" })));
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
    if (mode === "SINGLE") {
      setDates([dates[0] ?? EMPTY_DATE]);
    } else if (mode === "RECURRENT") {
      setDates([]);
    } else if (dates.length === 0) {
      setDates([EMPTY_DATE]);
    }
  }

  return (
    <form className="meeting-form" onSubmit={submit} aria-busy={status === "saving"}>
      <nav className="meeting-form-steps" aria-label="Secciones del formulario">
        <a href="#datos-academicos"><span>1</span><div><strong>Datos académicos</strong><small>Qué reunión vas a crear</small></div></a>
        <a href="#fechas"><span>2</span><div><strong>Fechas</strong><small>Cuándo se realizará</small></div></a>
        <a href="#organizacion"><span>3</span><div><strong>Organización</strong><small>Asistencia y cohosts</small></div></a>
      </nav>

      <FormSection id="datos-academicos" icon={<BookOpen size={19} />} number="1" title="Datos académicos" detail="Identificá la reunión y vinculala al programa correspondiente.">
        <div className="form-grid">
          <Field label="Título"><input name="titulo" placeholder="Ej. Seminario de metodología" required minLength={3} /></Field>
          <Field label="Programa y docente">
            <select
              name="docenteProgramaId"
              required
              value={selectedProgramId}
              onChange={(e) => setSelectedProgramId(e.target.value)}
            >
              <option value="" disabled>Seleccionar</option>
              {programs.map((option) => <option value={option.id} key={option.id}>{option.label} — {option.teacher}</option>)}
            </select>
          </Field>
          <fieldset className="field field-wide modality-choice">
            <legend>Modalidad</legend>
            <label><input type="radio" name="modalidad" value="VIRTUAL" defaultChecked /><span className="option-copy"><strong>Virtual</strong><small>Todos participan por Google Meet</small></span></label>
            <label><input type="radio" name="modalidad" value="HIBRIDA" /><span className="option-copy"><strong>Híbrida</strong><small>Combina participación presencial y remota</small></span></label>
          </fieldset>
          <Field label="Descripción general (opcional)" wide><textarea name="descripcion" placeholder="Contexto común a toda la serie" rows={3} /></Field>
        </div>
      </FormSection>

      <FormSection id="fechas" icon={<CalendarDays size={19} />} number="2" title="Fechas" detail="Todos los horarios se interpretan en UTC-3 · Montevideo.">
        <fieldset className="date-mode-selector">
          <legend>¿Cómo querés definir las fechas?</legend>
          <label>
            <input type="radio" name="dateMode" value="SINGLE" checked={dateMode === "SINGLE"} onChange={() => setMeetingDateMode("SINGLE")} />
            <span className="option-copy"><strong>Una fecha</strong><small>Un único encuentro</small></span>
          </label>
          <label>
            <input type="radio" name="dateMode" value="RECURRENT" checked={dateMode === "RECURRENT"} onChange={() => setMeetingDateMode("RECURRENT")} />
            <span className="option-copy"><strong>Repetición semanal</strong><small>Elegí un período, días y horario</small></span>
          </label>
          <label>
            <input type="radio" name="dateMode" value="MANUAL" checked={dateMode === "MANUAL"} onChange={() => setMeetingDateMode("MANUAL")} />
            <span className="option-copy"><strong>Fechas específicas</strong><small>Cargá cada encuentro por separado</small></span>
          </label>
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
              <div>
                <strong>{dateMode === "RECURRENT" ? "2. Revisá y ajustá los encuentros" : "Fechas cargadas manualmente"}</strong>
                {dateMode === "RECURRENT" ? <small>Podés cambiar fechas y horarios, quitar encuentros o agregar excepciones.</small> : null}
              </div>
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
                    {dateMode !== "SINGLE" ? (
                      <button className="icon-button remove-date" type="button" title={`Quitar encuentro ${index + 1}`} onClick={() => setDates(dates.filter((_, current) => current !== index))}><Trash2 size={18} /><span className="sr-only">Quitar encuentro {index + 1}</span></button>
                    ) : null}
                    <label className="field date-description">
                      <span>Descripción de este encuentro (opcional)</span>
                      <textarea rows={2} value={date.descripcion} placeholder="Si queda vacía, se usará la descripción general" onChange={(event) => setDates(updateDate(dates, index, "descripcion", event.target.value))} />
                    </label>
                  </div>
                ))}
              </div>
              {dateMode !== "SINGLE" ? (
                <button className="secondary-action add-date" type="button" onClick={() => setDates([...dates, EMPTY_DATE])}><Plus size={17} />{dateMode === "RECURRENT" ? "Agregar encuentro a la serie" : "Agregar otra fecha"}</button>
              ) : null}
            </>
          ) : null}
        </div>
      </FormSection>

      <FormSection id="organizacion" icon={<UsersRound size={19} />} number="3" title="Organización" detail="Definí los apoyos necesarios. La sala se asignará automáticamente.">
        <div className="form-grid">
          <div className="auto-room-note field-wide">
            <Video size={20} aria-hidden="true" />
            <div>
              <strong>Sala Meet automática con licencias de FLACSO</strong>
              <span>Elegiremos una sala disponible y configuraremos Google Meet. Los anfitriones y asistentes ingresan directamente con su propia cuenta de Google sin necesidad de usar las contraseñas de las salas.</span>
            </div>
          </div>
          <label className="check-field"><input name="requiereAsistenciaTecnica" type="checkbox" checked={requiresAssistance} onChange={(event) => setRequiresAssistance(event.target.checked)} /><span className="option-copy"><strong>Monitoreo</strong><small>Solicitar apoyo de un asistente durante el encuentro</small></span></label>
          <label className="check-field"><input name="requiereGrabacion" type="checkbox" /><span className="option-copy"><strong>Grabación</strong><small>Marcar que el encuentro debe grabarse</small></span></label>

          {requiresAssistance ? (
            <>
              {canAssignAssistant ? (
                <fieldset className="field field-wide assistance-choice">
                  <legend>Cobertura de monitoreo</legend>
                  <label><input type="radio" name="modoAsistencia" value="OPEN" checked={assistanceMode === "OPEN"} onChange={() => setAssistanceMode("OPEN")} /><span className="option-copy"><strong>Abierta a postulaciones</strong><small>Los asistentes disponibles podrán ofrecerse</small></span></label>
                  <label className={assistants.length === 0 ? "is-disabled" : ""}><input type="radio" name="modoAsistencia" value="ASSIGN" disabled={assistants.length === 0} checked={assistanceMode === "ASSIGN"} onChange={() => setAssistanceMode("ASSIGN")} /><span className="option-copy"><strong>Asignar ahora</strong><small>{assistants.length > 0 ? `${assistants.length} asistentes disponibles` : "No hay asistentes disponibles"}</small></span></label>
                </fieldset>
              ) : (
                <div className="field field-wide"><span>Cobertura de monitoreo</span><div><span className="status status-warning">Abierta a postulaciones</span></div></div>
              )}
              {canAssignAssistant && assistanceMode === "ASSIGN" ? (
                <Field label="Asistente de monitoreo" wide>
                  <select name="asistenteTecnicoId" required defaultValue=""><option value="" disabled>Seleccionar asistente de monitoreo</option>{assistants.map((assistant) => <option value={assistant.id} key={assistant.id}>{assistant.label}</option>)}</select>
                </Field>
              ) : null}
              <Field label="Otros correos">
                <textarea name="cohostEmailsManual" placeholder="correo@flacso.edu.uy, otro@flacso.edu.uy" rows={2} />
              </Field>
              <div className="auto-room-note field-wide" style={{ background: "#f5f9fa", borderColor: "#cde4ec" }}>
                <UsersRound size={18} aria-hidden="true" />
                <div>
                  <strong>Anfitrión asignado por monitoreo</strong>
                  <span>La persona que sea designada como asistente de monitoreo será el anfitrión de la sala en Google Meet. Mientras esté abierta a postulaciones, no se asignarán anfitriones preliminares.</span>
                </div>
              </div>
            </>
          ) : (
            <div className="field-wide" style={{ display: "grid", gap: "14px" }}>
              <fieldset className="field field-wide" style={{ border: "1px solid var(--line)", borderRadius: "8px", padding: "14px", background: "#fff" }}>
                <legend style={{ fontWeight: 700, padding: "0 6px" }}>Anfitrión de la reunión (obligatorio)</legend>
                <p style={{ color: "var(--muted)", fontSize: "0.82rem", margin: "0 0 12px 0" }}>
                  Al no requerir monitoreo, indicá quién será el anfitrión en Google Meet:
                </p>
                <div style={{ display: "grid", gap: "10px" }}>
                  <label style={{ display: "flex", alignItems: "center", gap: "8px", cursor: "pointer" }}>
                    <input
                      type="radio"
                      name="hostTipo"
                      value="DOCENTE"
                      checked={hostTipo === "DOCENTE"}
                      onChange={() => setHostTipo("DOCENTE")}
                    />
                    <span className="option-copy">
                      <strong>Docente del programa</strong>
                      <small>{selectedProgram ? `${selectedProgram.teacher}${selectedProgram.teacherEmail ? ` (${selectedProgram.teacherEmail})` : ""}` : "Docente del programa seleccionado"}</small>
                    </span>
                  </label>
                  <label style={{ display: "flex", alignItems: "center", gap: "8px", cursor: "pointer" }}>
                    <input
                      type="radio"
                      name="hostTipo"
                      value="OTRA_CUENTA"
                      checked={hostTipo === "OTRA_CUENTA"}
                      onChange={() => setHostTipo("OTRA_CUENTA")}
                    />
                    <span className="option-copy">
                      <strong>Otra cuenta institucional guardada</strong>
                      <small>Seleccionar de las cuentas Google registradas</small>
                    </span>
                  </label>
                  {hostTipo === "OTRA_CUENTA" ? (
                    <div style={{ marginLeft: "24px", marginTop: "4px" }}>
                      <select
                        name="hostCuentaId"
                        required={hostTipo === "OTRA_CUENTA"}
                        value={hostCuentaId}
                        onChange={(e) => setHostCuentaId(e.target.value)}
                        style={{ width: "100%", padding: "8px", borderRadius: "6px", border: "1px solid var(--line)" }}
                      >
                        <option value="" disabled>Seleccionar cuenta Google del anfitrión</option>
                        {cohosts.map((c) => (
                          <option value={c.id} key={c.id}>{c.email}</option>
                        ))}
                      </select>
                    </div>
                  ) : null}
                  <label style={{ display: "flex", alignItems: "center", gap: "8px", cursor: "pointer" }}>
                    <input
                      type="radio"
                      name="hostTipo"
                      value="OTRO_CORREO"
                      checked={hostTipo === "OTRO_CORREO"}
                      onChange={() => setHostTipo("OTRO_CORREO")}
                    />
                    <span className="option-copy">
                      <strong>Otro correo electrónico</strong>
                      <small>Ingresar dirección de correo de Google</small>
                    </span>
                  </label>
                  {hostTipo === "OTRO_CORREO" ? (
                    <div style={{ marginLeft: "24px", marginTop: "4px" }}>
                      <input
                        type="email"
                        name="hostEmail"
                        placeholder="anfitrion@flacso.edu.uy"
                        required={hostTipo === "OTRO_CORREO"}
                        value={hostEmail}
                        onChange={(e) => setHostEmail(e.target.value)}
                        style={{ width: "100%", padding: "8px", borderRadius: "6px", border: "1px solid var(--line)" }}
                      />
                    </div>
                  ) : null}
                </div>
                <div style={{ marginTop: "12px", padding: "8px 12px", background: "#f0f7f5", borderRadius: "6px", border: "1px solid #cce8e0", fontSize: "0.8rem", color: "#19634e" }}>
                  <strong>Autoinclusión:</strong> Tu usuario {currentUser?.email ? `(${currentUser.email})` : ""} también se agregará automáticamente como anfitrión de la reunión.
                </div>
              </fieldset>

              <details className="cohost-disclosure field-wide">
                <summary>
                  <div><strong>Cohosts adicionales (opcional)</strong><small>Otras personas secundarias con permisos de coorganización.</small></div>
                  <span>{cohosts.length} cuentas guardadas</span><ChevronDown size={18} aria-hidden="true" />
                </summary>
                <div className="cohost-disclosure-content">
                  {cohosts.length ? (
                    <fieldset className="field checkbox-list">
                      <legend>Cuentas guardadas</legend>
                      {cohosts.map((cohost) => <label key={cohost.id}><input type="checkbox" name="cohostCuentaIds" value={cohost.id} /><span>{cohost.email}</span></label>)}
                    </fieldset>
                  ) : null}
                  <Field label="Otros correos">
                    <textarea name="cohostEmailsManual" placeholder="correo@flacso.edu.uy, otro@flacso.edu.uy" rows={2} />
                  </Field>
                </div>
              </details>
            </div>
          )}
        </div>
      </FormSection>

      <footer className="form-actions">
        <div className="meeting-form-submit-summary">
          {status === "saving" ? (
            <p className="form-message saving" role="status">Creando la reunión y configurando Google Meet…</p>
          ) : status === "error" ? (
            <p className="form-message" role="alert">{message}</p>
          ) : dates.length === 0 ? (
            <><strong>Sin encuentros todavía</strong><span>{dateMode === "RECURRENT" && !recurrenceGenerated ? "Generá la repetición para continuar" : "Agregá un encuentro para continuar"}</span></>
          ) : (
            <><strong>{dates.length} {dates.length === 1 ? "encuentro" : "encuentros"}</strong><span>Se crearán en Google Calendar</span></>
          )}
        </div>
        <button className="primary-action" type="submit" disabled={dates.length === 0 || status === "saving" || status === "done"}>
          {status === "saving" ? <LoaderCircle className="button-spinner" size={18} /> : <CalendarPlus size={18} />}
          {status === "saving" ? "Creando reunión…" : dates.length === 0 ? "Definí las fechas" : `Crear ${dates.length === 1 ? "reunión" : `${dates.length} encuentros`}`}
        </button>
      </footer>
      {status === "saving" || status === "done" ? (
        <MeetingCreationDialog
          state={status}
          message={message}
          meetingId={createdMeetingId}
          meetingCount={dates.length}
        />
      ) : null}
    </form>
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

function localMontevideoToIso(fecha: string, hora: string): string {
  return new Date(`${fecha}T${hora}:00-03:00`).toISOString();
}

function wait(milliseconds: number): Promise<void> {
  return new Promise((resolve) => window.setTimeout(resolve, milliseconds));
}

function waitForNextPaint(): Promise<void> {
  return new Promise((resolve) => {
    window.requestAnimationFrame(() => window.requestAnimationFrame(() => resolve()));
  });
}
