import { Clock3, Mail } from "lucide-react";

export function AssistantReportConfigForm({
  emails,
  adminEmails,
  action
}: Readonly<{
  emails: readonly string[];
  adminEmails: readonly string[];
  action: (formData: FormData) => Promise<void>;
}>) {
  return (
    <section className="content-section">
      <div className="section-heading">
        <div>
          <h2>Destinatarios adicionales</h2>
          <p>
            El sistema envía el reporte el 1.º de cada mes con las horas registradas durante el mes anterior.
          </p>
        </div>
        <Clock3 size={22} color="var(--brand)" aria-hidden="true" />
      </div>

      <form action={action} className="assistant-report-form">
        <label className="field">
          <span>Agregar correos en copia</span>
          <textarea
            defaultValue={emails.join("\n")}
            name="correosCopiaReporteMensual"
            placeholder="administracion@flacso.edu.uy"
            rows={5}
          />
          <small>
            Ingresá un correo por línea o separalos con comas. Los administradores aparecen debajo y no hace
            falta repetirlos.
          </small>
        </label>
        <button className="primary-action" type="submit">
          Guardar destinatarios
        </button>
      </form>

      <div className="assistant-report-admins">
        <div className="assistant-report-admins-header">
          <div>
            <h3>Administradores incluidos automáticamente</h3>
            <p>Se usan las cuentas activas con rol Administración y correo configurado.</p>
          </div>
          <Mail size={19} aria-hidden="true" />
        </div>
        {adminEmails.length > 0 ? (
          <ul>
            {adminEmails.map((email) => (
              <li key={email}>{email}</li>
            ))}
          </ul>
        ) : (
          <p>No hay administradores activos con correo electrónico.</p>
        )}
      </div>
    </section>
  );
}
