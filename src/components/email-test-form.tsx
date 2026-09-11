"use client";

import { LoaderCircle, MailCheck, Send } from "lucide-react";
import { useState } from "react";

export function EmailTestForm({ defaultRecipient }: Readonly<{ defaultRecipient: string }>) {
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");
  const [success, setSuccess] = useState(false);

  async function sendTest(formData: FormData) {
    if (busy) return;
    setBusy(true);
    setSuccess(false);
    setMessage("Enviando un correo real…");
    try {
      const response = await fetch("/api/v1/configuracion/correo/test", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ destinatario: formData.get("destinatario") })
      });
      const result = await response.json().catch(() => ({}));
      setSuccess(response.ok);
      setMessage(response.ok
        ? result.message ?? "Correo de prueba enviado."
        : result.error ?? "No se pudo enviar el correo de prueba.");
    } catch {
      setMessage("No se pudo conectar con el servidor. Intentá nuevamente.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <section className="content-section email-test-section">
      <div className="section-heading">
        <div>
          <h2>Probar envío de correo</h2>
          <p>Esta acción envía un correo real mediante el mismo canal que usan las invitaciones y notificaciones.</p>
        </div>
        <MailCheck size={22} color="var(--brand)" aria-hidden="true" />
      </div>
      <form className="email-test-form" action={sendTest}>
        <label className="field">
          <span>Enviar prueba a</span>
          <input
            autoComplete="email"
            defaultValue={defaultRecipient}
            name="destinatario"
            placeholder="correo@flacso.edu.uy"
            required
            type="email"
          />
        </label>
        <button className="primary-action" disabled={busy} type="submit">
          {busy ? <LoaderCircle className="button-spinner" size={17} /> : <Send size={17} />}
          {busy ? "Enviando…" : "Enviar correo de prueba"}
        </button>
        <p className={`form-message email-test-message${success ? " done" : ""}`} role="status">
          {message}
        </p>
      </form>
      <p className="email-test-help">La prueba confirma la entrega al proveedor. Verificá que el mensaje llegue a Recibidos o Spam.</p>
    </section>
  );
}
