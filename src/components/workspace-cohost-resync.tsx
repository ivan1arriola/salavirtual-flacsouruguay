"use client";

import { CheckCircle2, LoaderCircle, RefreshCw, TriangleAlert, UsersRound } from "lucide-react";
import { useState } from "react";

type SyncFailure = Readonly<{ instanciaSalaId: string; titulo: string; inicio: string; error: string }>;
type PendingExternal = Readonly<{ instanciaSalaId: string; titulo: string; inicio: string; emails: readonly string[] }>;
type SyncResult = Readonly<{
  reunionesActivas: number;
  candidatas: number;
  cohostsAgregados: number;
  sincronizadas: number;
  omitidas: number;
  fallidas: number;
  cohostsExternosPendientes: number;
  reunionesConExternos: number;
  errores: readonly SyncFailure[];
  externos: readonly PendingExternal[];
  message: string;
}>;

export function WorkspaceCohostResync() {
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState<SyncResult | null>(null);
  const [error, setError] = useState("");

  async function resync() {
    if (!window.confirm(
      "Se agregarán como cohosts el docente y los asistentes técnicos asignados de las reuniones activas y futuras. Se conservarán los cohosts existentes y luego se intentará sincronizar con Google Meet. ¿Continuar?"
    )) return;

    setBusy(true);
    setResult(null);
    setError("");
    try {
      const response = await fetch("/api/v1/configuracion/google-workspace/resincronizar-cohosts", { method: "POST" });
      const payload = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(payload.error ?? "No se pudieron actualizar los cohosts.");
      setResult(payload as SyncResult);
    } catch (caught) {
      const message = caught instanceof Error ? caught.message : "No se pudieron actualizar los cohosts.";
      setError(message === "Failed to fetch" ? "No se pudo conectar con el servidor. Recargá la página e intentá nuevamente." : message);
    } finally {
      setBusy(false);
    }
  }

  const hasWarnings = Boolean(result && (result.fallidas > 0 || result.cohostsExternosPendientes > 0));

  return (
    <section className="form-section workspace-config workspace-resync-section" aria-labelledby="workspace-cohost-resync-title">
      <header className="form-section-title">
        <UsersRound size={22} aria-hidden="true" />
        <div>
          <h2 id="workspace-cohost-resync-title">Reuniones existentes</h2>
          <p>Completá los permisos de las reuniones que ya fueron creadas.</p>
        </div>
      </header>

      <div className="workspace-resync-action">
        <div className="workspace-resync-icon"><RefreshCw size={20} aria-hidden="true" /></div>
        <div>
          <strong>Actualizar cohosts</strong>
          <span>Agrega al docente y a los asistentes técnicos asignados, y conserva los demás cohosts que ya tenga la reunión.</span>
          <small>Verifica los permisos en Google Meet, también para cuentas Gmail y de otras instituciones. Si Google rechaza una asignación, muestra el error.</small>
        </div>
        <button className="secondary-action" disabled={busy} onClick={resync} type="button">
          {busy ? <LoaderCircle className="button-spinner" size={17} /> : <RefreshCw size={17} />}
          {busy ? "Actualizando…" : "Actualizar"}
        </button>
      </div>

      {error ? (
        <div className="workspace-resync-feedback is-error" role="alert">
          <TriangleAlert size={17} aria-hidden="true" /><span>{error}</span>
        </div>
      ) : null}

      {result ? (
        <div className={`workspace-resync-feedback${hasWarnings ? " is-warning" : " is-success"}`} role="status">
          {hasWarnings ? <TriangleAlert size={17} /> : <CheckCircle2 size={17} />}
          <div>
            <strong>{result.message}</strong>
            <span>
              {result.cohostsAgregados} cohosts agregados · {result.sincronizadas} sincronizadas · {result.cohostsExternosPendientes} externos pendientes · {result.fallidas} con error · {result.omitidas} omitidas
            </span>

            {result.externos.length > 0 ? (
              <details>
                <summary>Ver cohosts externos pendientes</summary>
                <ul>
                  {result.externos.map((item) => (
                    <li key={`external-${item.instanciaSalaId}`}>
                      <strong>{item.titulo}</strong>
                      <small>{new Date(item.inicio).toLocaleString("es-UY")} · {item.emails.join(", ")}</small>
                    </li>
                  ))}
                </ul>
              </details>
            ) : null}

            {result.errores.length > 0 ? (
              <details>
                <summary>Ver reuniones con error de Google</summary>
                <ul>
                  {result.errores.map((item) => (
                    <li key={item.instanciaSalaId}>
                      <strong>{item.titulo}</strong>
                      <small>{new Date(item.inicio).toLocaleString("es-UY")} · {item.error}</small>
                    </li>
                  ))}
                </ul>
              </details>
            ) : null}
          </div>
        </div>
      ) : null}
    </section>
  );
}
