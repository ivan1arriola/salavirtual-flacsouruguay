import { CalendarDays } from "lucide-react";
import { horarioAsistenciaCumpleMargen } from "@/src/modules/reuniones/horarios-asistencia.domain";
import { Field } from "./form-primitives";
import type { RecurrenceState } from "./tipos";

const WEEKDAYS = [
  { value: 1, label: "Lun" },
  { value: 2, label: "Mar" },
  { value: 3, label: "Mié" },
  { value: 4, label: "Jue" },
  { value: 5, label: "Vie" },
  { value: 6, label: "Sáb" },
  { value: 0, label: "Dom" },
] as const;

export function RecurrenceRuleEditor({
  recurrence,
  requiresAssistance,
  meetingMode,
  message,
  onChange,
  onTimeChange,
  onGenerate,
}: Readonly<{
  recurrence: RecurrenceState;
  requiresAssistance: boolean;
  meetingMode: "VIRTUAL" | "HIBRIDA";
  message: string;
  onChange: (campo: keyof RecurrenceState, value: string | readonly number[]) => void;
  onTimeChange: (campo: "horaInicio" | "horaFin", value: string) => void;
  onGenerate: () => void;
}>) {
  const requiereHorarioPresencial = meetingMode === "HIBRIDA" && requiresAssistance;
  return (
    <div className="recurrence-builder">
      <div className="recurrence-guidance">
        <strong>Definí la repetición</strong>
        <span>Indicá el período, el horario común y los días de la semana.</span>
      </div>
      <div className="recurrence-grid">
        <Field label="Fecha inicial">
          <input
            type="date"
            value={recurrence.desde}
            onChange={(event) => onChange("desde", event.target.value)}
          />
        </Field>
        <Field label="Fecha final">
          <input
            type="date"
            value={recurrence.hasta}
            onChange={(event) => onChange("hasta", event.target.value)}
          />
        </Field>
        <Field label="Hora de inicio">
          <input
            type="time"
            value={recurrence.horaInicio}
            onChange={(event) => onTimeChange("horaInicio", event.target.value)}
          />
        </Field>
        <Field label="Hora de fin">
          <input
            type="time"
            value={recurrence.horaFin}
            onChange={(event) => onTimeChange("horaFin", event.target.value)}
          />
        </Field>
        {requiereHorarioPresencial ? (
          <div className="meeting-assistance-fields">
            <strong>Cobertura presencial · mínima de 30 minutos antes y después</strong>
            <div className="meeting-assistance-grid">
              <Field label="Llegada del asistente">
                <input
                  type="time"
                  required
                  value={recurrence.horaAsistenciaInicio}
                  onChange={(event) => onChange("horaAsistenciaInicio", event.target.value)}
                />
              </Field>
              <Field label="Salida del asistente">
                <input
                  type="time"
                  required
                  value={recurrence.horaAsistenciaFin}
                  onChange={(event) => onChange("horaAsistenciaFin", event.target.value)}
                />
              </Field>
            </div>
            {recurrence.horaInicio &&
            recurrence.horaFin &&
            recurrence.horaAsistenciaInicio &&
            recurrence.horaAsistenciaFin &&
            !horarioAsistenciaCumpleMargen(recurrence, "HIBRIDA") ? (
              <span className="meeting-date-warning" role="alert">
                La llegada debe ser al menos 30 min antes del inicio y la salida al menos 30 min
                después del final.
              </span>
            ) : null}
          </div>
        ) : requiresAssistance ? (
          <div
            className="meeting-assistance-fields is-virtual"
            aria-label="Horario virtual fijo de monitoreo"
          >
            <strong>Cobertura virtual · horarios automáticos, no editables</strong>
            <div className="meeting-assistance-grid">
              <div className="meeting-assistance-readonly">
                <span>Llegada del asistente</span>
                <strong>{recurrence.horaAsistenciaInicio || "Pendiente del inicio"}</strong>
              </div>
              <div className="meeting-assistance-readonly">
                <span>Salida del asistente</span>
                <strong>{recurrence.horaAsistenciaFin || "Pendiente del fin"}</strong>
              </div>
            </div>
          </div>
        ) : null}
      </div>
      <fieldset className="weekday-selector">
        <legend>Días de la semana</legend>
        {WEEKDAYS.map((day) => (
          <label key={day.value}>
            <input
              type="checkbox"
              checked={recurrence.diasSemana.includes(day.value)}
              onChange={(event) =>
                onChange(
                  "diasSemana",
                  toggleWeekday(recurrence.diasSemana, day.value, event.target.checked),
                )
              }
            />
            <span>{day.label}</span>
          </label>
        ))}
      </fieldset>
      <div className="recurrence-actions">
        <span
          className={message ? "recurrence-feedback has-result" : "recurrence-feedback"}
          role="status"
        >
          {message || "Luego podrás revisar y ajustar cada encuentro."}
        </span>
        <button className="secondary-action" type="button" onClick={onGenerate}>
          <CalendarDays size={17} />
          Generar vista previa
        </button>
      </div>
    </div>
  );
}

function toggleWeekday(days: readonly number[], day: number, checked: boolean): readonly number[] {
  return checked ? [...days, day] : days.filter((value) => value !== day);
}
