import { AlertTriangle, CheckCircle2, MailWarning } from "lucide-react";

export type EstadoCorreoAuditado = Readonly<{
  id: string;
  fecha: string;
  tipo: string;
  estado: "ACEPTADO" | "OMITIDO" | "ERROR";
  transporte: string | null;
  motivo: string | null;
}>;

export function MailDeliveryDiagnostics({
  attempts,
  sesEnabled
}: Readonly<{ attempts: readonly EstadoCorreoAuditado[]; sesEnabled: boolean }>) {
  const accepted = attempts.filter((item) => item.estado === "ACEPTADO").length;
  const omitted = attempts.filter((item) => item.estado === "OMITIDO").length;
  const failed = attempts.filter((item) => item.estado === "ERROR").length;
  return (
    <section className="content-section" aria-labelledby="mail-delivery-diagnostics-heading">
      <header className="section-heading">
        <div>
          <h2 id="mail-delivery-diagnostics-heading">Diagnóstico de notificaciones por correo</h2>
          <p>
            Últimos {attempts.length} intentos registrados. «Aceptado» significa que el proveedor recibió la
            solicitud de envío, no que el mensaje llegó a Recibidos.
          </p>
        </div>
        <MailWarning size={22} aria-hidden="true" />
      </header>
      {!sesEnabled ? (
        <p className="form-notice" role="status">
          Amazon SES está desactivado. Se intentará Gmail y, únicamente si no está configurado, SMTP. Los
          fallos de Gmail no se reintentan automáticamente para evitar duplicaciones.
        </p>
      ) : null}
      <div className="settings-status-metrics" role="group" aria-label="Resultados de correo">
        <p>
          <CheckCircle2 size={16} aria-hidden="true" /> Aceptados: <strong>{accepted}</strong>
        </p>
        <p>
          <AlertTriangle size={16} aria-hidden="true" /> Errores: <strong>{failed}</strong>
        </p>
        <p>
          Omitidos: <strong>{omitted}</strong>
        </p>
      </div>
      {attempts.length === 0 ? (
        <p>
          Sin resultados auditados todavía. Los envíos anteriores a esta actualización no tienen registro de
          aceptación o fallo.
        </p>
      ) : (
        <div className="table-scroll" tabIndex={0} aria-label="Desplazar historial de envíos">
          <table className="data-table">
            <thead>
              <tr>
                <th scope="col">Fecha (UTC)</th>
                <th scope="col">Tipo</th>
                <th scope="col">Estado</th>
                <th scope="col">Proveedor</th>
                <th scope="col">Motivo</th>
              </tr>
            </thead>
            <tbody>
              {attempts.map((item) => (
                <tr key={item.id}>
                  <td>{item.fecha}</td>
                  <td>{item.tipo}</td>
                  <td>
                    <strong>{item.estado}</strong>
                  </td>
                  <td>{item.transporte ?? "—"}</td>
                  <td>{item.motivo ?? "—"}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      <p className="muted-text">
        Este historial no muestra destinatarios, asuntos ni contenido de correos. La recepción final y los
        rebotes deben confirmarse en el proveedor.
      </p>
    </section>
  );
}
