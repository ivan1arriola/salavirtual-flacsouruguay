"use client";

import { CheckCircle2, LoaderCircle, RefreshCw, TriangleAlert, UsersRound } from "lucide-react";
import { useState } from "react";

type SyncFailure = Readonly<{
  instanciaSalaId: string;
  titulo: string;
  inicio: string;
  error: string;
}>;

type SyncResult = Readonly<{
  reunionesActivas: number;
  candidatas: number;
  sincronizadas: number;
  omitidas: number;
  fallidas: number;
  errores: readonly SyncFailure[];
  message: string;
}>;

export function WorkspaceCohostResync() {
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState<SyncResult | null>(null);
  const [error, setError] = useState("");

  async function resync() {
    if (!window.confirm(
      "Se volverán a aplicar en Google Meet los cohosts ya guardados de todas las reuniones activas y futuras. No se modificarán fechas, enlaces ni asignaciones. ¿Continuar?"
    )) return;

    setBusy(true);
    setResult(null);
    setError("");
    try {
      const response = await fetch("/api/v1/configuracion/google-workspace/resincronizar-cohosts", { method: "POST" });
      const payload = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(payload.error ?? "No se pudieron sincronizar los cohosts.");
      setResult(payload as SyncResult);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "No se pudieron sincronizar los cohosts.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <section className="form-section workspace-config" aria-labelledby="workspace-cohost-resync-title">
      <header className="form-section-title">
        <UsersRound size={22} aria-hidden="true" />
        <div>
          <h2 id="workspace-cohost-resync-title">Reuniones existentes</h2>
          <p>Reaplicá en Google Meet los cohosts que ya están guardados en Sala Virtual.</p>
        </div>
      </header>

      <div className="auto-room-note">
        <RefreshCw size={20} aria-hidden="true" />
        <div>
          <strong>Sincronizar cohosts existentes</strong>
          <span>Recorre los encuentros activos y futuros con un Meet ya creado. No cambia quiénes son cohosts: solamente vuelve a aplicar esa configuración en Google.</span>
        </div>
        <button className="secondary-action" disabled={busy} onClick={resync} type="button">
          {busy ? <LoaderCircle className="button-spinner" size={17} /> : <RefreshCw size={17} />}
          {busy ? "Sincronizando…" : "Sincronizar cohosts"}
        </button>
      </div>

      {error ? <p className="form-message" role="alert"><TriangleAlert size={16} aria-hidden="true" /> {error}</p> : null}

      {result ? (
        <div style={{ marginTop: 12 }}>
          <p className={`form-message${result.fallidas === 0 ? " done" : ""}`} role="status">
            {result.fallidas === 0 ? <CheckCircle2 size={16} aria-hidden="true" /> : <TriangleAlert size={16} aria-hidden="true" />} {" "}
            <strong>{result.message}</strong>{" "}
            {result.candidatas} candidatas · {result.sincronizadas} sincronizadas · {result.omitidas} omitidas{result.fallidas > 0 ? ` · ${result.fallidas} con error` : ""}.
          </p>
          {result.errores.length > 0 ? (
            <details style={{ marginTop: 10 }}>
              <summary>Ver reuniones con error</summary>
              <ul className="settings-list" style={{ marginTop: 8 }}>
                {result.errores.map((item) => (
                  <li key={item.instanciaSalaId} style={{ alignItems: "flex-start" }}>
                    <span>
                      <strong>{item.titulo}</strong>
                      <small>{new Date(item.inicio).toLocaleString("es-UY")}</small>
                      <small style={{ overflowWrap: "anywhere" }}>{item.error}</small>
                    </span>
                  </li>
                ))}
              </ul>
            </details>
          ) : null}
        </div>
      ) : null}
    </section>
  );
}
