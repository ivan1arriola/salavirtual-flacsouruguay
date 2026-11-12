import { actualizarCorreoSesAdmin } from "../../app/(gestion)/configuracion/actions";

type Props = Readonly<{
  config: Readonly<{
    awsRegion: string | null;
    fromEmail: string | null;
    replyToEmail: string | null;
    activa: boolean;
  }> | null;
}>;

export function SesEmailSettingsForm({ config }: Props) {
  return (
    <section className="content-section email-test-section" aria-labelledby="ses-settings-title">
      <div className="section-heading">
        <div>
          <h2 id="ses-settings-title">Amazon SES</h2>
          <p>Usá el rol IAM de la instancia EC2. No se guardan claves de AWS en Sala Virtual.</p>
        </div>
      </div>
      <form action={actualizarCorreoSesAdmin} className="email-test-form">
        <label className="field">
          <span>Región de AWS</span>
          <input
            autoComplete="off"
            name="awsRegion"
            placeholder="us-east-1"
            defaultValue={config?.awsRegion ?? ""}
            required={config?.activa ?? false}
          />
        </label>
        <label className="field">
          <span>Remitente verificado en SES</span>
          <input
            autoComplete="email"
            name="fromEmail"
            type="email"
            placeholder="avisos@flacso.edu.uy"
            defaultValue={config?.fromEmail ?? ""}
            required={config?.activa ?? false}
          />
        </label>
        <label className="field">
          <span>Responder a (opcional)</span>
          <input
            autoComplete="email"
            name="replyToEmail"
            type="email"
            placeholder="secretaria@flacso.edu.uy"
            defaultValue={config?.replyToEmail ?? ""}
          />
        </label>
        <label className="checkbox-field">
          <input name="activa" type="checkbox" defaultChecked={config?.activa ?? false} />
          <span>Usar Amazon SES para notificaciones, invitaciones y pruebas</span>
        </label>
        <p className="email-test-help">
          Verificá la identidad en esta región. Si SES aún está en sandbox, el destinatario de prueba también
          debe estar verificado.
        </p>
        <button className="primary-action" type="submit">
          Guardar configuración SES
        </button>
      </form>
    </section>
  );
}
