"use client";

import { Plus, Save, Trash2 } from "lucide-react";
import { useState } from "react";

export function GoogleAccountsForm({
  userId,
  initialEmails,
  hasPassword
}: Readonly<{ userId: string; initialEmails: readonly string[]; hasPassword: boolean }>) {
  const [emails, setEmails] = useState<readonly string[]>(initialEmails.length ? initialEmails : [""]);
  const [message, setMessage] = useState("");

  async function save() {
    setMessage("Guardando…");
    const response = await fetch(`/api/v1/usuarios/${encodeURIComponent(userId)}/cuentas-google`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ emails: emails.filter(Boolean) })
    });
    const result = await response.json();
    setMessage(response.ok ? "Cuentas actualizadas." : result.error ?? "No se pudo guardar.");
  }

  return (
    <section className="form-section account-form">
      <div className="section-heading compact-heading">
        <div><h2>Cuentas Google autorizadas</h2><p>{hasPassword ? "También tiene acceso con contraseña." : "Sin contraseña local."}</p></div>
      </div>
      <div className="account-email-list">
        {emails.map((email, index) => (
          <div className="account-email-row" key={index}>
            <input type="email" value={email} placeholder="persona@gmail.com" onChange={(event) => setEmails(emails.map((current, position) => position === index ? event.target.value : current))} />
            <button className="icon-button" type="button" title="Quitar cuenta" onClick={() => setEmails(emails.filter((_, position) => position !== index))}><Trash2 size={18} /><span className="sr-only">Quitar cuenta</span></button>
          </div>
        ))}
      </div>
      <footer className="form-actions">
        <button className="secondary-action" type="button" onClick={() => setEmails([...emails, ""])}><Plus size={17} />Agregar cuenta</button>
        <span className="muted-text">{message}</span>
        <button className="primary-action" type="button" onClick={save}><Save size={17} />Guardar</button>
      </footer>
    </section>
  );
}
