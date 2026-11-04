"use client";

import {
  CalendarPlus,
  LoaderCircle
} from "lucide-react";
import { type FormEvent, useEffect, useRef, useState } from "react";
import { MeetingScheduleEditor } from "./nueva-reunion/meeting-schedule-editor";
import { AcademicDetails } from "./nueva-reunion/academic-details";
import { MeetingSummary } from "./nueva-reunion/meeting-summary";
import { MeetingOptions } from "./nueva-reunion/meeting-options";
import { MeetingCreationDialog } from "./meeting-creation-dialog";
import { generarFechasRecurrentes } from "@/src/modules/reuniones/recurrencia.domain";
import { horarioAsistenciaCumpleMargen, sincronizarHorarioAsistencia } from "@/src/modules/reuniones/horarios-asistencia.domain";
import type { Option, ProgramOption, MeetingDate, MeetingDateMode, RecurrenceState } from "./nueva-reunion/tipos";
import { construirSolicitudReunion, resolverAsistenteTecnicoId } from "./nueva-reunion/solicitud-reunion";
import { MeetingTypeSelector } from "./nueva-reunion/meeting-type-selector";
import { duplicarEncuentro, fechaIsoValida, fechasAlCambiarModo, invalidarRecurrencia, ordenarEncuentros, requiereConfirmacionCambio } from "./nueva-reunion/fechas-formulario";
import styles from "./nueva-reunion/nueva-reunion.module.css";

const EMPTY_DATE: MeetingDate = {
  id: 0,
  fecha: "",
  horaInicio: "",
  horaFin: "",
  horaAsistenciaInicio: "",
  horaAsistenciaFin: "",
  descripcion: ""
};

export function MeetingFormZoom({
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
  const [pendingMode, setPendingMode] = useState<MeetingDateMode | null>(null);
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
  const [selectedAssistantId, setSelectedAssistantId] = useState("");
  const [status, setStatus] = useState<"idle" | "saving" | "done" | "error">("idle");
  const [message, setMessage] = useState("");
  const [createdMeetingId, setCreatedMeetingId] = useState<string>();
  const submittingRef = useRef(false);
  const siguienteIdFechaRef = useRef(1);
  const mensajeErrorRef = useRef<HTMLParagraphElement>(null);
  const nuevaFecha = (): MeetingDate => ({ ...EMPTY_DATE, id: siguienteIdFechaRef.current++ });
  // Tras un error de envío, el foco pasa al mensaje para que quien usa lector de pantalla o teclado lo encuentre.
  useEffect(() => {
    if (status === "error") mensajeErrorRef.current?.focus();
  }, [status, message]);
  const idempotencyKeyRef = useRef<string>("");
  const recurrenceReviewRef = useRef<HTMLDivElement>(null);

  const selectedProgram = programs.find((program) => program.id === selectedProgramId);
  const academicReady = title.trim().length >= 3 && Boolean(selectedProgram);
  const datesReady = dates.length > 0 && dates.length <= 100 && (dateMode !== "SINGLE" || dates.length === 1) && (dateMode !== "RECURRENT" || recurrenceGenerated) && dates.every((date) =>
    Boolean(fechaIsoValida(date.fecha) && date.horaInicio && date.horaFin && date.horaFin > date.horaInicio) &&
    (!requiresAssistance || horarioAsistenciaCumpleMargen(date, meetingMode))
  );
  const isReady = academicReady && datesReady && !pendingMode;

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (submittingRef.current) return;
    if (pendingMode) return;
    if (!selectedProgram) {
      setStatus("error");
      setMessage("Seleccioná el programa y docente antes de crear la reunión.");
      return;
    }
    if (!datesReady) {
      setStatus("error");
      setMessage(meetingMode === "HIBRIDA" && requiresAssistance
        ? "Revisá las fechas y horarios: la cobertura híbrida necesita al menos 30 minutos antes y 30 minutos después."
        : "Revisá las fechas y horarios: la cobertura virtual empieza exactamente 15 minutos antes y termina con el encuentro.");
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
        body: JSON.stringify(construirSolicitudReunion({
          titulo: formData.get("titulo") as string,
          descripcion: (formData.get("descripcion") || undefined) as string | undefined,
          docenteProgramaId: selectedProgramId,
          asistenteTecnicoId: resolverAsistenteTecnicoId({ puedeAsignar: canAssignAssistant, requiereAsistencia: requiresAssistance, modoAsistencia: assistanceMode, valorSeleccionado: formData.get("asistenteTecnicoId") as string | null }),
          requiereAsistencia: requiresAssistance,
          requiereGrabacion: requiresRecording,
          modalidad: meetingMode,
          fechas: ordenarEncuentros(dates)
        }))
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
            ? "La reunión quedó guardada. El enlace de Zoom continúa pendiente."
            : "La reunión y sus enlaces de Zoom quedaron creados correctamente."
      );
    } catch (error) {
      submittingRef.current = false;
      setStatus("error");
      setMessage(error instanceof Error ? error.message : "No se pudo crear la reunión.");
    }
  }

  function horarioInicialSegunModalidad<T extends { horaInicio: string; horaFin: string; horaAsistenciaInicio: string; horaAsistenciaFin: string }>(date: T, modalidad: "VIRTUAL" | "HIBRIDA"): T {
    const limpio = { ...date, horaAsistenciaInicio: "", horaAsistenciaFin: "" };
    return sincronizarHorarioAsistencia(limpio, limpio, modalidad);
  }

  function cambiarModalidad(mode: "VIRTUAL" | "HIBRIDA") {
    setMeetingMode(mode);
    if (requiresAssistance) {
      setDates((current) => current.map((date) => horarioInicialSegunModalidad(date, mode)));
      setRecurrence((current) => horarioInicialSegunModalidad(current, mode));
    }
  }

  function cambiarRequiereAsistencia(value: boolean) {
    setRequiresAssistance(value);
    if (value) {
      setDates((current) => current.map((date) => horarioInicialSegunModalidad(date, meetingMode)));
      setRecurrence((current) => horarioInicialSegunModalidad(current, meetingMode));
    }
  }

  function cambiarHoraEncuentro(index: number, campo: "horaInicio" | "horaFin", value: string) {
    setDates((current) => current.map((date, i) => {
      if (i !== index) return date;
      const updated = { ...date, [campo]: value };
      return requiresAssistance ? sincronizarHorarioAsistencia(date, updated, meetingMode) : updated;
    }));
  }

  function invalidarVistaPreviaRecurrencia() {
    const invalidada = invalidarRecurrencia();
    setRecurrenceGenerated(invalidada.recurrenceGenerated);
    setDates(invalidada.dates);
    setRecurrenceMessage(invalidada.recurrenceMessage);
  }

  function cambiarRecurrencia(campo: "horaInicio" | "horaFin", value: string) {
    setRecurrence((current) => {
      const updated = { ...current, [campo]: value };
      return requiresAssistance ? sincronizarHorarioAsistencia(current, updated, meetingMode) : updated;
    });
    // Una regla modificada invalida las fechas ya generadas.
    invalidarVistaPreviaRecurrencia();
  }

  function generateRecurrence() {
    try {
      const generated = generarFechasRecurrentes(recurrence);
      if (requiresAssistance && !horarioAsistenciaCumpleMargen(recurrence, meetingMode)) {
        throw new Error(meetingMode === "HIBRIDA"
          ? "La cobertura híbrida debe empezar al menos 30 minutos antes y terminar al menos 30 minutos después."
          : "La cobertura virtual comienza exactamente 15 minutos antes y termina al mismo tiempo que el encuentro.");
      }
      if (generated.length === 0) throw new Error("No hay fechas que coincidan con esa regla.");
      setDates(generated.map((date) => ({
        ...date,
        id: siguienteIdFechaRef.current++,
        horaAsistenciaInicio: requiresAssistance ? recurrence.horaAsistenciaInicio : "",
        horaAsistenciaFin: requiresAssistance ? recurrence.horaAsistenciaFin : "",
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
    if (mode === dateMode) return;
    if (requiereConfirmacionCambio(dateMode, mode, dates, recurrence)) {
      setPendingMode(mode);
      return;
    }
    confirmarModo(mode);
  }

  function confirmarModo(mode: MeetingDateMode) {
    setDateMode(mode);
    setRecurrenceMessage("");
    setRecurrenceGenerated(false);
    setDates(fechasAlCambiarModo(mode, dates, nuevaFecha));
    setPendingMode(null);
  }

  return (
    <form className={styles.form} onSubmit={submit} aria-busy={status === "saving"}>
      <div className={styles.fields}>
      <MeetingTypeSelector dateMode={dateMode} onModeChange={setMeetingDateMode} pendingMode={pendingMode} onConfirm={() => { if (pendingMode) confirmarModo(pendingMode); }} onCancel={() => setPendingMode(null)} />

      <AcademicDetails programs={programs} selectedProgramId={selectedProgramId} onProgramChange={setSelectedProgramId} title={title} onTitleChange={setTitle} />

      <MeetingScheduleEditor
        dates={dates} dateMode={dateMode} requiresAssistance={requiresAssistance} meetingMode={meetingMode}
        recurrence={recurrence} message={recurrenceMessage} recurrenceGenerated={recurrenceGenerated}
        recurrenceReviewRef={recurrenceReviewRef} onModeChange={setMeetingDateMode}
        onChange={(campo, value) => { setRecurrence({ ...recurrence, [campo]: value }); invalidarVistaPreviaRecurrencia(); }}
        onRecurrenceTimeChange={cambiarRecurrencia} onGenerate={generateRecurrence}
        onFieldChange={(index, campo, value) => setDates(updateDate(dates, index, campo, value))}
        onTimeChange={cambiarHoraEncuentro}
        onRemove={(index) => setDates(dates.filter((_, current) => current !== index))}
        onAdd={() => { if (dates.length < 100) setDates([...dates, nuevaFecha()]); }}
        onSort={() => setDates(ordenarEncuentros(dates))}
        onDuplicate={(index) => { if (dates.length < 100) setDates([...dates, duplicarEncuentro(dates[index], siguienteIdFechaRef.current++)]); }}
      />

      <MeetingOptions
        requiresAssistance={requiresAssistance} requiresRecording={requiresRecording} meetingMode={meetingMode}
        assistanceMode={assistanceMode} canAssignAssistant={canAssignAssistant} assistants={assistants}
        selectedAssistantId={selectedAssistantId} onAssistantChange={setSelectedAssistantId}
        onRequiresAssistanceChange={cambiarRequiereAsistencia} onRequiresRecordingChange={setRequiresRecording}
        onModeChange={cambiarModalidad} onAssistanceModeChange={setAssistanceMode}
      />
      </div>

      <MeetingSummary dates={dates} dateMode={dateMode} selectedProgram={selectedProgram} isReady={isReady} academicReady={academicReady} requiresAssistance={requiresAssistance} requiresRecording={requiresRecording} meetingMode={meetingMode} canAssignAssistant={canAssignAssistant} assistanceMode={assistanceMode} selectedAssistant={assistants.find((assistant) => assistant.id === selectedAssistantId)} />

      <footer className={styles.actions}>
        {status === "saving" ? <p className="form-message saving" role="status">Creando la reunión y configurando Zoom…</p> : null}
        {status === "error" ? <p className="form-message" role="alert" ref={mensajeErrorRef} tabIndex={-1}>{message}</p> : null}
        <button className="primary-action" type="submit" disabled={!isReady || status === "saving" || status === "done"}>
          {status === "saving" ? <LoaderCircle className="button-spinner" size={18} /> : <CalendarPlus size={18} />}
          {status === "saving" ? "Creando reunión…" : dates.length === 0 ? "Definí las fechas" : `Crear ${dates.length === 1 ? "reunión" : `${dates.length} encuentros`}`}
        </button>
      </footer>

      {status === "saving" || status === "done" ? <MeetingCreationDialog state={status} message={message} meetingId={createdMeetingId} meetingCount={dates.length} /> : null}
    </form>
  );
}

function updateDate(dates: readonly MeetingDate[], index: number, key: Exclude<keyof MeetingDate, "id">, value: string): readonly MeetingDate[] {
  return dates.map((date, current) => current === index ? { ...date, [key]: value } : date);
}

function wait(milliseconds: number): Promise<void> {
  return new Promise((resolve) => window.setTimeout(resolve, milliseconds));
}

function waitForNextPaint(): Promise<void> {
  return new Promise((resolve) => window.requestAnimationFrame(() => window.requestAnimationFrame(() => resolve())));
}
