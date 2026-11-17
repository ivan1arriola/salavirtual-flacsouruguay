import { ChevronDown } from "lucide-react";

export type SettingsBlockStatus = Readonly<{ tone: "ok" | "warning" | "neutral"; label: string }>;

/** Resumen siempre visible; el formulario queda plegado detrás de «Editar». */
export function SettingsBlock({
  title,
  summary,
  status,
  children,
  defaultOpen
}: Readonly<{
  title: string;
  summary: React.ReactNode;
  status?: SettingsBlockStatus;
  children: React.ReactNode;
  defaultOpen?: boolean;
}>) {
  return (
    <section className="content-section settings-block">
      <div className="section-heading">
        <div>
          <h2>{title}</h2>
          <div className="settings-block__summary">{summary}</div>
        </div>
        {status ? <span className={`settings-section-status is-${status.tone}`}>{status.label}</span> : null}
      </div>
      <details className="settings-block__edit" open={defaultOpen}>
        <summary>
          Editar <ChevronDown size={16} aria-hidden="true" />
        </summary>
        <div className="settings-block__form">{children}</div>
      </details>
    </section>
  );
}

export function SettingsNotices({
  estado,
  error,
  mensajes
}: Readonly<{ estado?: string; error?: string; mensajes: Readonly<Record<string, string>> }>) {
  const mensaje = estado ? mensajes[estado] : undefined;
  return (
    <>
      {mensaje ? (
        <p className="form-notice" role="status">
          {mensaje}
        </p>
      ) : null}
      {error ? (
        <p className="form-notice form-notice-error" role="alert">
          {error}
        </p>
      ) : null}
    </>
  );
}
