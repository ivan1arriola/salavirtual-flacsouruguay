import { Clock3, UsersRound } from "lucide-react";
import { ChoicePanel, Field, FormSection } from "./form-primitives";
import type { Option } from "./tipos";

export function MeetingOptions({ requiresAssistance, requiresRecording, meetingMode, assistanceMode, canAssignAssistant, assistants, onRequiresAssistanceChange, onRequiresRecordingChange, onModeChange, onAssistanceModeChange }: Readonly<{
  requiresAssistance: boolean;
  requiresRecording: boolean;
  meetingMode: "VIRTUAL" | "HIBRIDA";
  assistanceMode: "OPEN" | "ASSIGN";
  canAssignAssistant: boolean;
  assistants: readonly Option[];
  onRequiresAssistanceChange: (value: boolean) => void;
  onRequiresRecordingChange: (value: boolean) => void;
  onModeChange: (mode: "VIRTUAL" | "HIBRIDA") => void;
  onAssistanceModeChange: (mode: "OPEN" | "ASSIGN") => void;
}>) {
  const requiereHorarioPresencial = meetingMode === "HIBRIDA" && requiresAssistance;
  return (
    <FormSection id="organizacion" icon={<UsersRound size={19} />} number="3" title="Opciones" detail="Indicá si debe grabarse y si requiere un asistente técnico.">
      <div className="organization-v2">
        <section className="organization-support-grid" aria-label="Soporte y grabación">
          <ChoicePanel
            title="Monitoreo"
            detail="¿Necesitás que un asistente de monitoreo participe?"
            name="requiereAsistenciaTecnica"
            value={requiresAssistance}
            noLabel="No requiere"
            noDetail="La reunión puede realizarse sin monitoreo."
            yesLabel="Sí, solicitar"
            yesDetail="Se asignará un asistente de monitoreo."
            onChange={onRequiresAssistanceChange}
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
            onChange={onRequiresRecordingChange}
          />
        </section>

        {requiereHorarioPresencial ? (
          <div className="meeting-assistance-return">
            <Clock3 size={18} aria-hidden="true" />
            <div>
              <strong>Horarios de asistencia presencial</strong>
              <span>La llegada se programa 30 minutos antes y la salida 30 minutos después del encuentro, como mínimo. Ambos horarios se pueden ampliar.</span>
              <a href="#fechas">Revisar llegada y salida en Fechas</a>
            </div>
          </div>
        ) : requiresAssistance ? (
          <div className="meeting-assistance-return">
            <Clock3 size={18} aria-hidden="true" />
            <div>
              <strong>Asistencia virtual con horario fijo</strong>
              <span>La cobertura comienza 15 minutos antes y termina exactamente con el encuentro.</span>
              <a href="#fechas">Ver los horarios en Fechas</a>
            </div>
          </div>
        ) : null}

        {requiresAssistance ? (
          <section className="organization-subsection organization-assistance-config">
            <div className="organization-subsection-heading"><div><h3>Cobertura de monitoreo</h3><p>{meetingMode === "HIBRIDA" ? "El horario de monitoreo se define por fecha, con al menos 30 minutos de preparación y 30 minutos después del cierre." : "El horario virtual es fijo: 15 minutos antes y salida al finalizar. Definí la asignación del asistente."}</p></div></div>
            <fieldset className="field field-wide modality-choice">
              <legend>Modalidad</legend>
              <label><input type="radio" name="modalidad" value="VIRTUAL" checked={meetingMode === "VIRTUAL"} onChange={() => onModeChange("VIRTUAL")} /><span className="option-copy"><strong>Virtual</strong><small>Todos participan por Zoom</small></span></label>
              <label><input type="radio" name="modalidad" value="HIBRIDA" checked={meetingMode === "HIBRIDA"} onChange={() => onModeChange("HIBRIDA")} /><span className="option-copy"><strong>Híbrida</strong><small>Combina participación presencial y remota</small></span></label>
            </fieldset>
            {canAssignAssistant ? (
              <fieldset className="assistance-choice organization-assistance-choice">
                <label><input type="radio" name="modoAsistencia" value="OPEN" checked={assistanceMode === "OPEN"} onChange={() => onAssistanceModeChange("OPEN")} /><span className="option-copy"><strong>Abierta a postulaciones</strong><small>Los asistentes disponibles podrán ofrecerse</small></span></label>
                <label className={assistants.length === 0 ? "is-disabled" : ""}><input type="radio" name="modoAsistencia" value="ASSIGN" disabled={assistants.length === 0} checked={assistanceMode === "ASSIGN"} onChange={() => onAssistanceModeChange("ASSIGN")} /><span className="option-copy"><strong>Asignar ahora</strong><small>{assistants.length > 0 ? `${assistants.length} asistentes disponibles` : "No hay asistentes disponibles"}</small></span></label>
              </fieldset>
            ) : <span className="status status-warning">Abierta a postulaciones</span>}
            {canAssignAssistant && assistanceMode === "ASSIGN" ? (
              <Field label="Asistente de monitoreo"><select name="asistenteTecnicoId" required defaultValue=""><option value="" disabled>Seleccionar asistente de monitoreo</option>{assistants.map((assistant) => <option value={assistant.id} key={assistant.id}>{assistant.label}</option>)}</select></Field>
            ) : null}
          </section>
        ) : null}

      </div>
    </FormSection>
  );
}
