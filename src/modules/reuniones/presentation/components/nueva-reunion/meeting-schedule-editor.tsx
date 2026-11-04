import { CalendarDays, Clock3 } from "lucide-react";
import type { RefObject } from "react";
import { FormSection } from "./form-primitives";
import { MeetingInstancesEditor, type MeetingInstancesEditorProps } from "./meeting-instances-editor";
import { RecurrenceRuleEditor } from "./recurrence-rule-editor";
import type { MeetingDateMode, RecurrenceState } from "./tipos";

export function MeetingScheduleEditor({ dates, dateMode, requiresAssistance, meetingMode, recurrence, message, recurrenceGenerated, recurrenceReviewRef, onModeChange, onChange, onRecurrenceTimeChange, onGenerate, onFieldChange, onTimeChange, onRemove, onAdd, onDuplicate, onSort }: MeetingInstancesEditorProps & Readonly<{
  recurrence: RecurrenceState;
  message: string;
  recurrenceGenerated: boolean;
  recurrenceReviewRef: RefObject<HTMLDivElement | null>;
  onModeChange: (mode: MeetingDateMode) => void;
  onChange: (campo: keyof RecurrenceState, value: string | readonly number[]) => void;
  onRecurrenceTimeChange: (campo: "horaInicio" | "horaFin", value: string) => void;
  onGenerate: () => void;
}>) {
  return (
    <FormSection id="fechas" icon={<CalendarDays size={19} />} title="Fechas" detail="Todos los horarios se interpretan en UTC-3 · Montevideo.">
      {dateMode !== "SINGLE" ? <fieldset className="date-mode-selector">
        <legend>¿Cómo querés definir las fechas?</legend>
        <label><input type="radio" name="dateMode" value="RECURRENT" checked={dateMode === "RECURRENT"} onChange={() => onModeChange("RECURRENT")} /><span className="option-copy"><strong>Repetición semanal</strong><small>Elegí un período, días y horario</small></span></label>
        <label><input type="radio" name="dateMode" value="MANUAL" checked={dateMode === "MANUAL"} onChange={() => onModeChange("MANUAL")} /><span className="option-copy"><strong>Fechas específicas</strong><small>Cargá cada encuentro por separado</small></span></label>
      </fieldset> : null}
      {requiresAssistance ? (
        <div className={`meeting-assistance-hint${meetingMode === "VIRTUAL" ? " is-virtual" : ""}`} role="note">
          <Clock3 size={19} aria-hidden="true" />
          {meetingMode === "HIBRIDA" ? (
            <div><strong>Híbrida: al menos 30 minutos antes y después</strong><span>Los horarios se proponen automáticamente y podés ampliarlos según sea necesario.</span></div>
          ) : (
            <div><strong>Virtual: 15 minutos antes, sin tiempo adicional al final</strong><span>La llegada y salida se calculan automáticamente y son fijas; no tenés que completarlas.</span></div>
          )}
        </div>
      ) : null}
      <div className="date-list">
        {dateMode === "RECURRENT" ? (
          <RecurrenceRuleEditor recurrence={recurrence} requiresAssistance={requiresAssistance} meetingMode={meetingMode} message={message} onChange={onChange} onTimeChange={onRecurrenceTimeChange} onGenerate={onGenerate} />
        ) : null}
        {dateMode === "MANUAL" || recurrenceGenerated ? (
          <div className={dateMode === "RECURRENT" ? "generated-dates-heading recurrence-review-heading" : "generated-dates-heading"} ref={dateMode === "RECURRENT" ? recurrenceReviewRef : undefined}>
            <div><strong>{dateMode === "RECURRENT" ? "Revisá y ajustá los encuentros" : "Fechas específicas"}</strong><small>Se muestran en orden cronológico. Podés duplicar, quitar o agregar encuentros.</small></div>
            <span className="date-count">{dates.length} {dates.length === 1 ? "encuentro" : "encuentros"}</span>
          </div>
        ) : null}
        {dateMode !== "RECURRENT" || recurrenceGenerated ? (
          <MeetingInstancesEditor dates={dates} dateMode={dateMode} requiresAssistance={requiresAssistance} meetingMode={meetingMode} onFieldChange={onFieldChange} onTimeChange={onTimeChange} onRemove={onRemove} onAdd={onAdd} onDuplicate={onDuplicate} onSort={onSort} />
        ) : null}
      </div>
    </FormSection>
  );
}
