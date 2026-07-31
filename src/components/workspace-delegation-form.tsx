"use client";

import { Save, TestTube2, UserRoundCheck } from "lucide-react";
import { useState } from "react";
import { saveWorkspaceSection, testWorkspaceSection } from "./workspace-config.client";

export function WorkspaceDelegationForm({ subject }: Readonly<{ subject: string }>) {
  const [message, setMessage] = useState("");
  const [success, setSuccess] = useState(false);

  async function save(formData: FormData) {
    setMessage("Guardando…");
    const result = await saveWorkspaceSection({
      seccion: "DELEGACION",
      serviceAccountSubject: formData.get("serviceAccountSubject")
    });
    setSuccess(result.ok);
    setMessage(result.message);
  }

  async function test() {
    setMessage("Probando delegación…");
    const result = await testWorkspaceSection("DELEGACION");
    setSuccess(result.ok);
    setMessage(result.message);
  }

  return (
    <form className="form-section workspace-config" action={save}>
      <header className="form-section-title">
        <UserRoundCheck size={22} aria-hidden="true" />
        <div><h2>Delegación de Workspace</h2><p>Usuario institucional usado para validar la delegación.</p></div>
      </header>
      <div className="form-grid">
        <label className="field field-wide">
          <span>Usuario delegado</span>
          <input type="email" name="serviceAccountSubject" defaultValue={subject} required />
        </label>
        <div className="field field-wide config-scopes">
          <span>Scopes autorizados</span>
          <code>calendar.events</code>
          <code>drive</code>
          <code>meetings.space.settings</code>
          <code>meetings.space.readonly</code>
        </div>
      </div>
      <footer className="form-actions">
        <span className={`form-message${success ? " done" : ""}`} role="status">{message}</span>
        <div className="workspace-actions">
          <button className="secondary-action" type="button" onClick={test}><TestTube2 size={17} />Probar</button>
          <button className="primary-action" type="submit"><Save size={17} />Guardar</button>
        </div>
      </footer>
    </form>
  );
}
