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
          <h2>Reportes mensuales de asistencia técnica</h2>
          <p>El 1.º de cada mes se informa a cada asistente las horas registradas durante el mes anterior.</p>
        </div>
        <Clock3 size={22} color="var(--brand)" aria-hidden="true" />
      </div>

      <form action={action} className="settings-form">
        <label className="field">
          <span>Correos adicionales en copia</span>
          <textarea
            defaultValue={emails.join("\n")}
            name="correosCopiaReporteMensual"
            placeholder="administracion@flacso.edu.uy"
            rows={5}
          />
          <small>Podés ingresar un correo por línea o separarlos con comas. Los administradores del sistema se agregan automáticamente.</small>
        </label>
        <button className="primary-action" type="submit">Guardar destinatarios</button>
      </form>

      <div className="settings-summary">
        <div className="section-heading">
          <div>
            <h3>Administradores incluidos automáticamente</h3>
            <p>Se usan las cuentas activas con rol Administración y correo configurado.</p>
          </div>
          <Mail size={19} aria-hidden="true" />
        </div>
        {adminEmails.length > 0 ? (
          <ul>
            {adminEmails.map((email) => <li key={email}>{email}</li>)}
          </ul>
        ) : (
          <p>No hay administradores activos con correo electrónico.</p>
        )}
      </div>
    </section>
  );
}
