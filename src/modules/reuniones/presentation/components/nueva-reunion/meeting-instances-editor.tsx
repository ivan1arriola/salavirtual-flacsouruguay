import { Copy, Plus, Trash2 } from "lucide-react";
import { horarioAsistenciaCumpleMargen, sugerirHorarioAsistencia } from "@/src/modules/reuniones/horarios-asistencia.domain";
import { Field } from "./form-primitives";
import type { MeetingDate, MeetingDateMode } from "./tipos";
import { detectarSolapamientos, ordenarEncuentros } from "./fechas-formulario";

export type MeetingInstancesEditorProps = Readonly<{
  dates: readonly MeetingDate[];
  dateMode: MeetingDateMode;
  requiresAssistance: boolean;
  meetingMode: "VIRTUAL" | "HIBRIDA";
  onFieldChange: (index: number, campo: Exclude<keyof MeetingDate, "id">, value: string) => void;
  onTimeChange: (index: number, campo: "horaInicio" | "horaFin", value: string) => void;
  onRemove: (index: number) => void;
  onAdd: () => void;
  onDuplicate: (index: number) => void;
  /** Ordena cronológicamente a pedido; nunca mientras se edita una fila. */
  onSort?: () => void;
}>;

export function MeetingInstancesEditor({ dates, dateMode, requiresAssistance, meetingMode, onFieldChange, onTimeChange, onRemove, onAdd, onDuplicate, onSort }: MeetingInstancesEditorProps) {
  const requiereHorarioPresencial = meetingMode === "HIBRIDA" && requiresAssistance;
  const desordenadas = ordenarEncuentros(dates).some((fila, i) => fila.id !== dates[i].id);
  const solapamientos = detectarSolapamientos(dates);
  return (
    <>
      {solapamientos.length ? <p className="meeting-date-warning" role="note"><strong>Hay encuentros que se solapan.</strong> Revisá las fechas y horarios. Podés continuar si son correctos.</p> : null}
      <div className="date-rows">
        {dates.map((date, index) => {
          const posicion = index;
          return (
          <div className={dateMode === "SINGLE" ? "date-row date-row-single" : "date-row"} key={date.id}>
            {dateMode !== "SINGLE" ? <span className="date-row-number" aria-hidden="true">{posicion + 1}</span> : null}
            <Field label="Fecha"><input type="date" required value={date.fecha} onChange={(event) => onFieldChange(index, "fecha", event.target.value)} /></Field>
            <Field label="Hora de inicio"><input type="time" required value={date.horaInicio} onChange={(event) => onTimeChange(index, "horaInicio", event.target.value)} /></Field>
            <Field label="Hora de fin"><input type="time" required value={date.horaFin} onChange={(event) => onTimeChange(index, "horaFin", event.target.value)} /></Field>
            {requiereHorarioPresencial ? (
              <div className="meeting-assistance-fields">
                <strong>Monitoreo presencial <small>· mínimo 30 min antes y después</small></strong>
                <div className="meeting-assistance-grid">
                  <Field label="Llegada del asistente"><input type="time" required value={date.horaAsistenciaInicio} onChange={(event) => onFieldChange(index, "horaAsistenciaInicio", event.target.value)} /></Field>
                  <Field label="Salida del asistente"><input type="time" required value={date.horaAsistenciaFin} onChange={(event) => onFieldChange(index, "horaAsistenciaFin", event.target.value)} /></Field>
                </div>
              </div>
            ) : requiresAssistance ? (
              <div className="meeting-assistance-fields is-virtual" aria-label="Horario virtual fijo de monitoreo">
                <strong>Cobertura virtual · 15 minutos antes, salida al finalizar</strong>
                <div className="meeting-assistance-grid">
                  <div className="meeting-assistance-readonly"><span>Llegada del asistente</span><strong>{sugerirHorarioAsistencia(date.horaInicio, date.horaFin, "VIRTUAL").llegada || "—"}</strong></div>
                  <div className="meeting-assistance-readonly"><span>Salida del asistente</span><strong>{date.horaFin || "—"}</strong></div>
                </div>
              </div>
            ) : null}
            {dateMode !== "SINGLE" ? <div className="date-row-actions">
              <button type="button" aria-label={`Duplicar encuentro ${posicion + 1}`} disabled={dates.length >= 100} onClick={() => onDuplicate(index)}><Copy size={18} aria-hidden="true" />Duplicar</button>
              <button type="button" title={`Quitar encuentro ${posicion + 1}`} aria-label={`Quitar encuentro ${posicion + 1}`} onClick={() => onRemove(index)}><Trash2 size={18} aria-hidden="true" />Quitar</button>
            </div> : null}
            <details className="meeting-date-notes" key={dateMode + "-" + date.id + "-notes"}>
              <summary><Plus size={15} aria-hidden="true" /> Notas del encuentro <span>(opcional)</span></summary>
              <label className="field date-description"><span>Descripción de este encuentro</span><textarea rows={2} value={date.descripcion} placeholder="Si queda vacía, se usará la descripción general" onChange={(event) => onFieldChange(index, "descripcion", event.target.value)} /></label>
            </details>
            {date.horaInicio && date.horaFin && date.horaFin <= date.horaInicio ? <p className="meeting-date-warning" role="status">La hora de fin debe ser posterior a la de inicio.</p> : null}
            {requiereHorarioPresencial && date.horaInicio && date.horaFin && date.horaAsistenciaInicio && date.horaAsistenciaFin && !horarioAsistenciaCumpleMargen(date) ? <p className="meeting-date-warning" role="alert">El asistente debe llegar al menos 30 minutos antes y salir 30 minutos después del encuentro.</p> : null}
          </div>
        );})}
      </div>
      {dateMode !== "SINGLE" && desordenadas && onSort ? <button className="secondary-action" type="button" data-accion="ordenar" onClick={onSort}>Ordenar por fecha y hora</button> : null}
      {dateMode !== "SINGLE" ? <button className="secondary-action add-date" type="button" disabled={dates.length >= 100} onClick={onAdd}><Plus size={17} aria-hidden="true" />{dateMode === "RECURRENT" ? "Agregar encuentro a la serie" : "Agregar otra fecha"}</button> : null}
      {dates.length >= 100 ? <p role="note">Máximo de 100 encuentros. Quitá uno para agregar otra fecha.</p> : null}
    </>
  );
}
