"use client";

import { useState } from "react";
import { CheckCircle2, KeyRound, ShieldAlert, TestTube2, Video } from "lucide-react";

export type ZoomConfigVisible = Readonly<{
  accountId: string | null;
  clientId: string | null;
  clientSecretConfigurado: boolean;
  activa: boolean;
}>;

export function ZoomConfigForm({
  initial
}: Readonly<{
  initial: ZoomConfigVisible | null;
}>) {
  const [accountId, setAccountId] = useState(initial?.accountId ?? "");
  const [clientId, setClientId] = useState(initial?.clientId ?? "");
  const [clientSecret, setClientSecret] = useState("");
  const [activa, setActiva] = useState(initial?.activa ?? true);

  const [saving, setSaving] = useState(false);
  const [testing, setTesting] = useState(false);
  const [message, setMessage] = useState<{ text: string; ok: boolean } | null>(null);

  async function handleSave(event: React.FormEvent) {
    event.preventDefault();
    setSaving(true);
    setMessage(null);

    try {
      const response = await fetch("/api/v1/configuracion/zoom", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          accountId,
          clientId,
          clientSecret: clientSecret.trim() || undefined,
          activa
        })
      });

      const data = await response.json().catch(() => ({}));
      if (!response.ok) {
        throw new Error(data.error ?? "No se pudo guardar la configuración.");
      }

      setMessage({ text: data.message ?? "Configuración de Zoom guardada exitosamente.", ok: true });
      setClientSecret("");
    } catch (err) {
      setMessage({
        text: err instanceof Error ? err.message : "Error al guardar la configuración.",
        ok: false
      });
    } finally {
      setSaving(false);
    }
  }

  async function handleTest() {
    setTesting(true);
    setMessage(null);

    try {
      const response = await fetch("/api/v1/configuracion/zoom", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          accountId,
          clientId,
          clientSecret: clientSecret.trim() || undefined
        })
      });

      const data = await response.json().catch(() => ({}));
      if (!response.ok) {
        throw new Error(data.error ?? "No se pudo conectar con Zoom API.");
      }

      setMessage({
        text: data.message ?? "Conexión con Zoom API establecida correctamente.",
        ok: true
      });
    } catch (err) {
      setMessage({
        text: err instanceof Error ? err.message : "Error al probar conexión con Zoom.",
        ok: false
      });
    } finally {
      setTesting(false);
    }
  }

  const isConfigured = Boolean(
    initial?.accountId && initial?.clientId && initial?.clientSecretConfigurado
  );

  return (
    <div className="settings-workspace-groups">
      <section className="workspace-overview settings-wide" aria-label="Resumen de Zoom">
        <div className="workspace-overview-heading">
          <Video size={21} aria-hidden="true" />
          <div>
            <strong>
              {isConfigured
                ? "Integración institucional Zoom configurada"
                : "Credenciales de Zoom pendientes de configurar"}
            </strong>
            <span>Server-to-Server OAuth · Soporte para 10 salas del grupo institucional</span>
          </div>
        </div>
        <div className="workspace-overview-statuses">
          <span className={isConfigured ? "is-ready" : "is-pending"}>
            {isConfigured ? <CheckCircle2 size={15} /> : <KeyRound size={15} />}
            {isConfigured ? "Credenciales cargadas" : "Pendiente de credenciales"}
          </span>
          <span className={activa ? "is-ready" : "is-pending"}>
            {activa ? <CheckCircle2 size={15} /> : <ShieldAlert size={15} />}
            {activa ? "Integración activa" : "Integración inactiva"}
          </span>
        </div>
      </section>

      <section className="content-section email-test-section">
        <div className="section-heading">
          <div>
            <h2>Credenciales Server-to-Server OAuth</h2>
            <p>
              Generadas en <strong>Zoom App Marketplace</strong> con tipo Server-to-Server OAuth.
              Permite crear, reprogramar y cancelar reuniones en cualquiera de las 10 cuentas del grupo.
            </p>
          </div>
        </div>

        {message ? (
          <div
            className={`form-notice ${message.ok ? "form-notice-success" : "form-notice-error"}`}
            role={message.ok ? "status" : "alert"}
            style={{ marginBottom: "1rem" }}
          >
            {message.text}
          </div>
        ) : null}

        <form onSubmit={handleSave} className="email-test-form">
          <label className="field">
            <span>Account ID</span>
            <input
              type="text"
              autoComplete="off"
              required
              placeholder="Ej: abc123XYZ..."
              value={accountId}
              onChange={(e) => setAccountId(e.target.value)}
            />
          </label>

          <label className="field">
            <span>Client ID</span>
            <input
              type="text"
              autoComplete="off"
              required
              placeholder="Ej: dEf456UVW..."
              value={clientId}
              onChange={(e) => setClientId(e.target.value)}
            />
          </label>

          <label className="field">
            <span>Client Secret</span>
            <input
              type="password"
              autoComplete="new-password"
              placeholder={
                initial?.clientSecretConfigurado
                  ? "•••••••••••••••• (dejar vacío para conservar)"
                  : "Ingresar Client Secret"
              }
              required={!initial?.clientSecretConfigurado}
              value={clientSecret}
              onChange={(e) => setClientSecret(e.target.value)}
            />
            {initial?.clientSecretConfigurado ? (
              <small style={{ color: "#666" }}>
                El Client Secret se encuentra cifrado en la base de datos. Solo ingresá uno nuevo si deseás actualizarlo.
              </small>
            ) : null}
          </label>

          <label className="checkbox-field">
            <input
              type="checkbox"
              checked={activa}
              onChange={(e) => setActiva(e.target.checked)}
            />
            <span>Habilitar la plataforma Zoom para la creación y gestión de reuniones</span>
          </label>

          <div style={{ display: "flex", gap: "0.75rem", marginTop: "1rem" }}>
            <button className="primary-action" type="submit" disabled={saving}>
              {saving ? "Guardando…" : "Guardar credenciales Zoom"}
            </button>
            <button
              className="secondary-action"
              type="button"
              onClick={handleTest}
              disabled={testing || (!clientSecret && !initial?.clientSecretConfigurado)}
            >
              <TestTube2 size={16} />
              {testing ? "Probando…" : "Probar conexión"}
            </button>
          </div>
        </form>

        <div
          style={{
            marginTop: "1.5rem",
            padding: "1rem",
            background: "rgba(0,0,0,0.03)",
            borderRadius: "8px",
            fontSize: "0.9rem"
          }}
        >
          <strong>Configuración recomendada de la App en Zoom:</strong>
          <ul style={{ marginTop: "0.5rem", paddingLeft: "1.2rem", lineHeight: "1.5" }}>
            <li>Tipo de App: <strong>Server-to-Server OAuth</strong></li>
            <li>
              Scopes necesarios:
              <code> meeting:write:meeting:admin</code>,
              <code> meeting:read:meeting:admin</code>,
              <code> meeting:update:meeting:admin</code>,
              <code> meeting:delete:meeting:admin</code>,
              <code> meeting:read:list_meetings:admin</code>,
              <code> group:read:list_groups:admin</code>,
              <code> group_member:read:list_members:admin</code>
            </li>
            <li>
              Las 10 cuentas de sala deben ser miembros de la misma organización o cuenta maestra.
              La app institucional asignará automáticamente el anfitrión adecuado a cada sala.
            </li>
          </ul>
        </div>
      </section>
    </div>
  );
}
