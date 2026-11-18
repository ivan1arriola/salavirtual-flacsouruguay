"use client";

import { CheckCircle2, CircleAlert, Code2, LoaderCircle, ShieldCheck } from "lucide-react";
import { useState } from "react";
import {
  validateWorkspaceScopes,
  type WorkspaceScopeAccountValidation,
  type WorkspaceScopesResult
} from "./workspace-config.client";

const SCOPE_LABELS = [
  ["Calendar", "calendar.events", "https://www.googleapis.com/auth/calendar.events"],
  ["Drive", "drive", "https://www.googleapis.com/auth/drive"],
  ["Gmail", "gmail.send", "https://www.googleapis.com/auth/gmail.send"],
  ["Sheets · asistencia", "spreadsheets", "https://www.googleapis.com/auth/spreadsheets"]
] as const;

export function WorkspaceScopesValidator() {
  const [result, setResult] = useState<WorkspaceScopesResult | null>(null);
  const [busy, setBusy] = useState(false);
  const accounts = result?.accounts ?? [];
  const roomAccounts = accounts.filter(({ tipo }) => tipo === "SALA");
  const okRooms = roomAccounts.filter(({ ok }) => ok).length;
  const missingScopes = accounts.flatMap((account) =>
    account.scopes.filter(({ autorizado }) => !autorizado).map((scope) => ({ account, scope }))
  );

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
    <section
      className="form-section workspace-config workspace-scopes-card"
      aria-labelledby="workspace-scopes-title"
    >
      <header className="form-section-title">
        <ShieldCheck size={22} aria-hidden="true" />
        <div>
          <h2 id="workspace-scopes-title">Permisos de Google</h2>
          <p>Verificá los permisos de Calendar, Drive, Gmail y Sheets usados por Sala Virtual.</p>
        </div>
      </header>

      {!result ? (
        <div className="workspace-scopes-overview">
          <div className="workspace-scope-chips" aria-label="Permisos requeridos">
            {SCOPE_LABELS.map(([label, key]) => (
              <span key={key}>{label}</span>
            ))}
          </div>

          <details className="workspace-technical-details">
            <summary>
              <Code2 size={16} aria-hidden="true" /> Ver scopes OAuth
            </summary>
            <div className="config-scopes workspace-scope-code-list">
              {SCOPE_LABELS.map(([, key, scope]) => (
                <code key={key}>{scope}</code>
              ))}
            </div>
          </details>
        </div>
      ) : (
        <div className="workspace-validation-results">
          <div className={`workspace-validation-summary${result.ok ? " is-ok" : " is-warning"}`}>
            {result.ok ? <CheckCircle2 size={19} /> : <CircleAlert size={19} />}
            <div>
              <strong>
                {okRooms}/{roomAccounts.length} cuentas sala correctas
              </strong>
              <span>
                {missingScopes.length === 0
                  ? "Todos los permisos requeridos están autorizados."
                  : `${missingScopes.length} autorizaciones requieren atención.`}
              </span>
            </div>
          </div>

          {accounts.map((account) => (
            <ScopeAccountDetails account={account} key={`${account.tipo}-${account.subject}`} />
          ))}
        </div>
      )}

      <footer className="form-actions workspace-validation-actions">
        <span className={`form-message${result?.ok ? " done" : ""}`} role="status">
          {result?.message ?? "La prueba es segura: no modifica datos ni crea reuniones."}
        </span>
        <button className="secondary-action" disabled={busy} onClick={validate} type="button">
          {busy ? <LoaderCircle className="button-spinner" size={17} /> : <ShieldCheck size={17} />}
          {busy ? "Validando…" : result ? "Validar nuevamente" : "Validar cuentas"}
        </button>
      </footer>
    </section>
  );
}

function ScopeAccountDetails({ account }: Readonly<{ account: WorkspaceScopeAccountValidation }>) {
  return (
    <details className="workspace-scope-account" open={!account.ok}>
      <summary>
        <span>
          <strong>{account.subject}</strong>
          <small>
            {account.tipo === "GENERAL"
              ? "Cuenta delegada"
              : account.activa
                ? "Sala activa"
                : "Sala inactiva"}
          </small>
        </span>
        <span className={`status status-${account.ok ? "ok" : "error"}`}>
          {account.ok ? <CheckCircle2 size={14} /> : <CircleAlert size={14} />}
          {account.ok ? "Correcta" : "Revisar"}
        </span>
      </summary>
      <ul className="settings-list workspace-scope-account-list">
        {account.scopes.map((scope) => (
          <li key={scope.key}>
            <span>
              <strong>{scope.label}</strong>
              {!scope.autorizado && scope.error ? <small>{scope.error}</small> : null}
            </span>
            <span className={`status status-${scope.autorizado ? "ok" : "error"}`}>
              {scope.autorizado ? <CheckCircle2 size={14} /> : <CircleAlert size={14} />}
              {scope.autorizado ? "Autorizado" : "Falta"}
            </span>
          </li>
        ))}
      </ul>
    </details>
  );
}
