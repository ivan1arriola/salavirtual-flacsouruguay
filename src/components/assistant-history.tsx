import { formatDateTime } from "@/src/lib/ui/format";
import type {
  AccionHistorialAsistencia,
  RegistroHistorialAsistenciaPersonal,
} from "@/src/modules/asistencia/resumen-personal.domain";

function actionLabel(action: AccionHistorialAsistencia): string {
  if (action === "DESVINCULADO") return "Desvinculado";
  if (action === "REASIGNADO") return "Asignado por reasignación";
  return "Asignado";
}

function actionClass(action: AccionHistorialAsistencia): string {
  return action === "DESVINCULADO" ? "assistant-history-status removed" : "assistant-history-status";
}

export function AssistantHistory({
  entries,
}: Readonly<{
  entries: readonly RegistroHistorialAsistenciaPersonal[];
}>) {
  return (
    <section className="content-section assistant-history-section">
      <div className="section-heading assistant-detail-list-heading">
        <div>
          <h2>Historial de asignaciones</h2>
          <p>Cambios registrados automáticamente para consultas posteriores.</p>
        </div>
      </div>

      {entries.length > 0 ? (
        <div className="table-wrap">
          <table className="data-table assistant-history-table">
            <thead>
              <tr>
                <th>Cambio</th>
                <th>Reunión</th>
                <th>Fecha del encuentro</th>
                <th>Registrado</th>
                <th>Realizado por</th>
              </tr>
            </thead>
            <tbody>
              {entries.map((entry) => (
                <tr key={entry.id}>
                  <td><span className={actionClass(entry.accion)}>{actionLabel(entry.accion)}</span></td>
                  <td><strong>{entry.titulo}</strong></td>
                  <td className="date-cell">{formatDateTime(entry.instanciaInicioAt)}</td>
                  <td className="date-cell">{formatDateTime(entry.ocurrioAt)}</td>
                  <td>{entry.actor}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : (
        <div className="empty-state"><p>No hay cambios de asignación registrados en este período.</p></div>
      )}
    </section>
  );
}
