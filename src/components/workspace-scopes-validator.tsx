"use client";

import { CheckCircle2, CircleAlert, LoaderCircle, ShieldCheck } from "lucide-react";
import { useState } from "react";
import {
  validateWorkspaceScopes,
  type WorkspaceScopesResult
} from "./workspace-config.client";

export function WorkspaceScopesValidator() {
  const [result, setResult] = useState<WorkspaceScopesResult | null>(null);
  const [busy, setBusy] = useState(false);

  async function validate() {
    setBusy(true);
    setResult(null);
    try {
      setResult(await validateWorkspaceScopes());
    } finally {
      setBusy(false);
    }
  }

  return (
    <section className="form-section workspace-config" aria-labelledby="workspace-scopes-title">
      <header className="form-section-title">
        <ShieldCheck size={22} aria-hidden="true" />
        <div>
          <h2 id="workspace-scopes-title">Validación de scopes</h2>
          <p>Comprueba los permisos OAuth efectivos de la delegación de todo el dominio.</p>
        </div>
      </header>

      {result?.subject ? (
        <p className="form-message">Prueba realizada como <strong>{result.subject}</strong>.</p>
      ) : null}

      {result?.scopes.length ? (
        <ul className="settings-list">
          {result.scopes.map((scope) => (
            <li key={scope.key}>
              <span>
                <strong>{scope.label}</strong>
                <small><code>{scope.scope}</code></small>
                {!scope.autorizado && scope.error ? <small>{scope.error}</small> : null}
              </span>
              <span className={`status status-${scope.autorizado ? "ok" : "error"}`}>
                {scope.autorizado
                  ? <CheckCircle2 size={14} aria-hidden="true" />
                  : <CircleAlert size={14} aria-hidden="true" />}
                {scope.autorizado ? "Autorizado" : "Falta autorización"}
              </span>
            </li>
          ))}
        </ul>
      ) : (
        <div className="config-scopes">
          <code>calendar.events</code>
          <code>drive</code>
          <code>meetings.space.settings</code>
          <code>meetings.space.readonly</code>
          <code>gmail.send</code>
        </div>
      )}

      <footer className="form-actions">
        <span className={`form-message${result?.ok ? " done" : ""}`} role="status">
          {result?.message ?? "La prueba no modifica datos ni crea reuniones."}
        </span>
        <button className="secondary-action" disabled={busy} onClick={validate} type="button">
          {busy ? <LoaderCircle className="button-spinner" size={17} /> : <ShieldCheck size={17} />}
          {busy ? "Validando…" : "Validar scopes"}
        </button>
      </footer>
    </section>
  );
}
