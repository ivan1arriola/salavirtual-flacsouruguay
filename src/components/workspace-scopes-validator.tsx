"use client";

import { CheckCircle2, CircleAlert, LoaderCircle, ShieldCheck } from "lucide-react";
import { useState } from "react";
import {
  validateWorkspaceScopes,
  type WorkspaceScopeAccountValidation,
  type WorkspaceScopesResult
} from "./workspace-config.client";

const WRAPPABLE_CODE_STYLE = {
  display: "block",
  maxWidth: "100%",
  overflowWrap: "anywhere",
  whiteSpace: "normal",
  wordBreak: "break-word"
} as const;

export function WorkspaceScopesValidator() {
  const [result, setResult] = useState<WorkspaceScopesResult | null>(null);
  const [busy, setBusy] = useState(false);
  const accounts = result?.accounts ?? [];
  const roomAccounts = accounts.filter(({ tipo }) => tipo === "SALA");
  const okRooms = roomAccounts.filter(({ ok }) => ok).length;
  const missingScopes = accounts.flatMap((account) =>
    account.scopes
      .filter(({ autorizado }) => !autorizado)
      .map((scope) => ({ account, scope }))
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
      className="form-section workspace-config"
      aria-labelledby="workspace-scopes-title"
      style={{ minWidth: 0, maxWidth: "100%" }}
    >
      <header className="form-section-title">
        <ShieldCheck size={22} aria-hidden="true" />
        <div style={{ minWidth: 0 }}>
          <h2 id="workspace-scopes-title">Validación de scopes</h2>
          <p>Comprueba la delegación OAuth en cada cuenta sala y en la cuenta delegada general.</p>
        </div>
      </header>

      {result ? (
        <div style={{ minWidth: 0 }}>
          <p className={`form-message${result.ok ? " done" : ""}`}>
            <strong>{okRooms}/{roomAccounts.length} cuentas sala</strong> tienen todos los scopes requeridos.
          </p>

          {missingScopes.length > 0 ? (
            <div role="alert" style={{ minWidth: 0 }}>
              <p className="form-message">
                <strong>{missingScopes.length === 1 ? "Falta una autorización" : `Faltan ${missingScopes.length} autorizaciones`}.</strong>{" "}
                Se muestran abiertas las cuentas que requieren atención.
              </p>
              <div className="config-scopes" aria-label="Scopes faltantes por cuenta" style={{ minWidth: 0 }}>
                {missingScopes.map(({ account, scope }) => (
                  <code key={`${account.subject}-${scope.key}`} style={WRAPPABLE_CODE_STYLE}>
                    {account.subject} · {scope.scope}
                  </code>
                ))}
              </div>
            </div>
          ) : (
            <p className="form-message done">
              <strong>No falta ningún scope.</strong> Todas las cuentas comprobadas aceptaron los permisos requeridos.
            </p>
          )}

          <div style={{ display: "grid", gap: 10, marginTop: 14, minWidth: 0 }}>
            {accounts.map((account) => (
              <ScopeAccountDetails account={account} key={`${account.tipo}-${account.subject}`} />
            ))}
          </div>
        </div>
      ) : (
        <div style={{ minWidth: 0 }}>
          <p className="form-message">
            Se comprobarán Calendar, Drive, configuración y lectura de Meet, y envío por Gmail para todas las cuentas configuradas.
          </p>
          <div className="config-scopes" style={{ minWidth: 0 }}>
            <code style={WRAPPABLE_CODE_STYLE}>https://www.googleapis.com/auth/calendar.events</code>
            <code style={WRAPPABLE_CODE_STYLE}>https://www.googleapis.com/auth/drive</code>
            <code style={WRAPPABLE_CODE_STYLE}>https://www.googleapis.com/auth/meetings.space.settings</code>
            <code style={WRAPPABLE_CODE_STYLE}>https://www.googleapis.com/auth/meetings.space.readonly</code>
            <code style={WRAPPABLE_CODE_STYLE}>https://www.googleapis.com/auth/gmail.send</code>
          </div>
          <p className="form-message">
            <strong>Nota:</strong> <code>meetings.space.created</code> no es requerido actualmente porque Sala Virtual crea los Meets mediante Google Calendar, no mediante <code>spaces.create</code>. El scope <code>drive</code> ya cubre las operaciones de archivos que necesita la app.
          </p>
        </div>
      )}

      <footer className="form-actions" style={{ minWidth: 0 }}>
        <span
          className={`form-message${result?.ok ? " done" : ""}`}
          role="status"
          style={{ minWidth: 0, overflowWrap: "anywhere" }}
        >
          {result?.message ?? "La prueba no modifica datos ni crea reuniones."}
        </span>
        <button className="secondary-action" disabled={busy} onClick={validate} type="button">
          {busy ? <LoaderCircle className="button-spinner" size={17} /> : <ShieldCheck size={17} />}
          {busy ? "Validando todas…" : "Validar todas las cuentas"}
        </button>
      </footer>
    </section>
  );
}

function ScopeAccountDetails({
  account
}: Readonly<{ account: WorkspaceScopeAccountValidation }>) {
  return (
    <details
      open={!account.ok}
      style={{
        minWidth: 0,
        overflow: "hidden",
        border: "1px solid var(--line)",
        borderRadius: 8,
        background: "#fff"
      }}
    >
      <summary
        style={{
          minWidth: 0,
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          gap: 10,
          cursor: "pointer",
          padding: "11px 13px"
        }}
      >
        <span style={{ minWidth: 0, overflowWrap: "anywhere" }}>
          <strong>{account.subject}</strong>
          <small style={{ display: "block", color: "var(--muted)" }}>
            {account.tipo === "GENERAL" ? "Cuenta delegada general" : account.activa ? "Cuenta sala activa" : "Cuenta sala inactiva"}
          </small>
        </span>
        <span className={`status status-${account.ok ? "ok" : "error"}`} style={{ flex: "0 0 auto" }}>
          {account.ok
            ? <CheckCircle2 size={14} aria-hidden="true" />
            : <CircleAlert size={14} aria-hidden="true" />}
          {account.ok ? "Correcta" : "Revisar"}
        </span>
      </summary>

      <ul className="settings-list" style={{ minWidth: 0, maxWidth: "100%", borderTop: "1px solid var(--line)" }}>
        {account.scopes.map((scope) => (
          <li key={scope.key} style={{ minWidth: 0, flexWrap: "wrap" }}>
            <span style={{ minWidth: 0, flex: "1 1 240px", maxWidth: "100%" }}>
              <strong>{scope.label}</strong>
              <small style={{ minWidth: 0, maxWidth: "100%" }}>
                <code style={WRAPPABLE_CODE_STYLE}>{scope.scope}</code>
              </small>
              {!scope.autorizado && scope.error ? (
                <small style={{ overflowWrap: "anywhere" }}>{scope.error}</small>
              ) : null}
            </span>
            <span
              className={`status status-${scope.autorizado ? "ok" : "error"}`}
              style={{ flex: "0 0 auto" }}
            >
              {scope.autorizado
                ? <CheckCircle2 size={14} aria-hidden="true" />
                : <CircleAlert size={14} aria-hidden="true" />}
              {scope.autorizado ? "Autorizado" : "Falta este scope"}
            </span>
          </li>
        ))}
      </ul>
    </details>
  );
}
