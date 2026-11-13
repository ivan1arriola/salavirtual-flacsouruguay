"use client";

import { useState, useSyncExternalStore } from "react";

const rutaWebhook = "/api/v1/webhooks/zoom";
const subscribeOrigin = () => () => {};

export function ZoomWebhookConfig({ initialConfigured }: Readonly<{ initialConfigured: boolean }>) {
  const [configured, setConfigured] = useState(initialConfigured);
  const [secretToken, setSecretToken] = useState("");
  const url = useSyncExternalStore(
    subscribeOrigin,
    () => `${window.location.origin}${rutaWebhook}`,
    () => rutaWebhook
  );
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState<{ text: string; ok: boolean } | null>(null);

  async function save(event: React.FormEvent) {
    event.preventDefault();
    setSaving(true);
    setMessage(null);
    try {
      const response = await fetch("/api/v1/configuracion/zoom/webhook", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ secretToken })
      });
      const result = await response.json().catch(() => ({}));
      if (!response.ok) {
        throw new Error(result.error ?? "No se pudo guardar el Secret Token.");
      }
      setSecretToken("");
      setConfigured(true);
      setMessage({ text: "Secret Token guardado. Ya podés validar la URL en Zoom.", ok: true });
    } catch (error) {
      setMessage({ text: error instanceof Error ? error.message : "Error al guardar.", ok: false });
    } finally {
      setSaving(false);
    }
  }

  async function remove() {
    setSaving(true);
    setMessage(null);
    try {
      const response = await fetch("/api/v1/configuracion/zoom/webhook", { method: "DELETE" });
      const result = await response.json().catch(() => ({}));
      if (!response.ok) {
        throw new Error(result.error ?? "No se pudo eliminar el Secret Token.");
      }
      setSecretToken("");
      setConfigured(false);
      setMessage({ text: "Secret Token eliminado. El webhook dejó de aceptar eventos.", ok: true });
    } catch (error) {
      setMessage({ text: error instanceof Error ? error.message : "Error al eliminar.", ok: false });
    } finally {
      setSaving(false);
    }
  }

  const saveLabel = configured ? "Reemplazar Secret Token" : "Guardar Secret Token";

  return (
    <section className="content-section email-test-section" aria-labelledby="zoom-webhook-title">
      <div className="section-heading">
        <div>
          <h2 id="zoom-webhook-title">Notificaciones de Zoom</h2>
          <p>Recibí el estado de las clases, la asistencia y las grabaciones mediante webhooks.</p>
        </div>
      </div>
      <label className="field">
        <span>Event Notification Endpoint URL</span>
        <input type="text" readOnly value={url} onFocus={(event) => event.currentTarget.select()} />
        <small>Copiá esta URL en Event Subscriptions de tu app en Zoom Marketplace.</small>
      </label>
      <form onSubmit={save} className="email-test-form">
        <label className="field">
          <span>Secret Token {configured ? "(configurado)" : "(pendiente)"}</span>
          <input
            type="password"
            autoComplete="new-password"
            value={secretToken}
            onChange={(event) => setSecretToken(event.target.value)}
            placeholder={configured ? "Dejá vacío para conservar el actual" : "Pegá el Secret Token de Zoom"}
            required={!configured}
            maxLength={512}
          />
          <small>
            Se guarda cifrado. No se muestra después de guardar; usá este campo para reemplazarlo.
          </small>
        </label>
        {message ? (
          <p
            className={`form-notice ${message.ok ? "form-notice-success" : "form-notice-error"}`}
            role="status"
          >
            {message.text}
          </p>
        ) : null}
        <div style={{ display: "flex", gap: "0.75rem", flexWrap: "wrap" }}>
          <button className="primary-action" type="submit" disabled={saving || !secretToken.trim()}>
            {saving ? "Guardando…" : saveLabel}
          </button>
          {configured ? (
            <button className="secondary-action" type="button" onClick={remove} disabled={saving}>
              Eliminar Secret Token
            </button>
          ) : null}
        </div>
      </form>
      <p>
        Usá el <strong>Secret Token</strong> de Event Subscriptions; es distinto del Client Secret de OAuth.
      </p>
    </section>
  );
}
