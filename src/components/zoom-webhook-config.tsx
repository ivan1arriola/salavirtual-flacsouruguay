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
          <p>
            Eventos de Zoom que Sala Virtual procesa para actualizar clases, grabaciones y la agenda de salas.
          </p>
        </div>
      </div>
      <div className="zoom-webhook-events" aria-labelledby="zoom-webhook-events-title">
        <h3 id="zoom-webhook-events-title">Eventos para activar en Zoom Marketplace</h3>
        <p>Activá estos grupos en Event Subscriptions de la app Zoom. Los eventos opcionales mejoran el diagnóstico en vivo.</p>

        <h4>Estado y archivos (recomendados)</h4>
        <ul>
          <li><code>meeting.started</code><span>Marca el inicio real de la clase.</span></li>
          <li><code>meeting.ended</code><span>Marca el cierre y permite consultar el reporte oficial de asistencia.</span></li>
          <li><code>recording.completed</code><span>Adelanta la búsqueda y copia de grabaciones a Drive.</span></li>
          <li><code>recording.transcript_completed</code><span>Adelanta la búsqueda de transcripciones.</span></li>
          <li><code>meeting.created</code>, <code>meeting.updated</code>, <code>meeting.deleted</code><span>Mantienen sincronizada la agenda de reuniones creadas directamente en Zoom.</span></li>
        </ul>

        <h4>Actividad de participantes (recomendados)</h4>
        <ul>
          <li><code>meeting.participant_joined</code> y <code>meeting.participant_left</code><span>Entradas y salidas de participantes.</span></li>
          <li><code>meeting.participant_joined_waiting_room</code>, <code>meeting.participant_left_waiting_room</code>, <code>meeting.participant_admitted</code>, <code>meeting.participant_put_in_waiting_room</code><span>Movimientos y admisiones de la sala de espera.</span></li>
          <li><code>meeting.participant_jbh_waiting</code> y <code>meeting.participant_jbh_waiting_left</code><span>Personas esperando al anfitrión o que abandonan antes de que ingrese.</span></li>
          <li><code>meeting.participant_role_changed</code><span>Cambios de anfitrión, coanfitrión o participante.</span></li>
          <li><code>meeting.participant_joined_breakout_room</code> y <code>meeting.participant_left_breakout_room</code><span>Movimientos entre la sala principal y grupos pequeños.</span></li>
          <li><code>meeting.sharing_started</code> y <code>meeting.sharing_ended</code><span>Inicio y fin de pantalla compartida.</span></li>
        </ul>
        <p><strong>Scopes para participantes y pantalla compartida:</strong> <code>meeting:read:participant:admin</code> o <code>meeting:read:participant</code> (granulares), o los scopes de lectura de reuniones equivalentes.</p>

        <h4>Calidad de la reunión (muy recomendado)</h4>
        <ul>
          <li><code>meeting.alert</code><span>Informa audio o vídeo inestable, mala calidad al compartir pantalla, CPU elevada y problemas de reconexión.</span></li>
          <li><code>recording.started</code>, <code>recording.stopped</code>, <code>recording.paused</code>, <code>recording.resumed</code><span>Permiten reconstruir el ciclo real de grabación.</span></li>
        </ul>
        <p><strong>Scopes:</strong> <code>meeting:read:alert:admin</code> o <code>meeting:read:alert</code> para alertas; <code>cloud_recording:read:recording:admin</code> o <code>cloud_recording:read:recording</code> para eventos de grabación.</p>
        <p><strong>Requisito de alertas:</strong> cuenta Business o superior y opción <em>Meeting quality scores and network alerts on Dashboard</em> habilitada en la configuración de Zoom.</p>

        <h4>Datos de participantes en vivo (API de Zoom Dashboard)</h4>
        <p>La lista en vivo y las métricas de audio, vídeo y pantalla se consultan directamente a Zoom. Requieren cuenta Business o superior, Dashboard habilitado y uno de estos scopes: <code>dashboard_meetings:read:admin</code> o <code>dashboard:read:admin</code>. Las métricas de calidad también requieren habilitar las puntuaciones de calidad en Dashboard.</p>
        <p><strong>Importante:</strong> los webhooks alimentan la cronología y las alertas; no se usan para calcular minutos ni para inventar una lista de asistencia. La asistencia oficial se obtiene del reporte de Zoom al finalizar la reunión. La consulta de participantes tiene un límite de uso elevado; Sala Virtual la actualiza cada 30 segundos mientras la consola está abierta.</p>

        <p><strong>Agenda:</strong> además de estos eventos, Sala Virtual consulta la agenda completa de Zoom cada 30 minutos y desde Centro de operaciones › Zoom › Agenda de Zoom.</p>
      </div>
      <label className="field">
        <span>Event Notification Endpoint URL</span>
        <input type="text" readOnly value={url} onFocus={(event) => event.currentTarget.select()} />
        <small>Copiá esta URL en Event Subscriptions y pulsá Validate después de guardar el token.</small>
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
        Guardarlo aquí no activa los eventos: también tenés que seleccionarlos y habilitar la suscripción en
        Zoom.
      </p>
    </section>
  );
}
