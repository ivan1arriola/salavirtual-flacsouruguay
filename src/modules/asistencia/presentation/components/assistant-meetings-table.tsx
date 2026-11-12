import type { RegistroAsistenciaPersonal } from "@/src/modules/asistencia/resumen-personal.domain";
import { formatDateTime } from "@/src/lib/ui/format";
import { formatMinutes, formatMoney } from "@/src/lib/ui/assistant-format";
import { AssistantUnassignButton } from "./assistant-unassign-button";

export function AssistantMeetingsTable({
  meetings
}: Readonly<{ meetings: readonly RegistroAsistenciaPersonal[] }>) {
  return (
    <div className="table-wrap">
      <table className="data-table">
        <thead>
          <tr>
            <th>Fecha y hora (UTC-3)</th>
            <th>Reunión</th>
            <th>Programa</th>
            <th>Modalidad</th>
            <th>Duración</th>
            <th>Importe</th>
            <th>Estado</th>
            <th>Acciones</th>
          </tr>
        </thead>
        <tbody>
          {meetings.map((meeting) => (
            <tr key={meeting.id}>
              <td className="date-cell">{formatDateTime(meeting.inicioAt)}</td>
              <td>
                <strong>{meeting.titulo}</strong>
                <small>{meeting.docente}</small>
              </td>
              <td>{meeting.programa}</td>
              <td>{meeting.modalidad === "HIBRIDA" ? "Híbrida" : "Virtual"}</td>
              <td>{formatMinutes(meeting.minutos)}</td>
              <td>{meeting.monto === null ? "Sin tarifa" : formatMoney(meeting.monto, meeting.moneda)}</td>
              <td>
                <span
                  className={`status ${meeting.estado === "FINALIZADA" ? "status-ok" : "status-neutral"}`}
                >
                  {meeting.estado.toLowerCase()}
                </span>
              </td>
              <td className="assistant-actions-cell">
                <AssistantUnassignButton assignmentId={meeting.id} title={meeting.titulo} />
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
