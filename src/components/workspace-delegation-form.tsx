"use client";

import { Code2, Save, TestTube2, UserRoundCheck } from "lucide-react";
import { useState } from "react";
import { saveWorkspaceSection, testWorkspaceSection } from "./workspace-config.client";

const SCOPES = ["calendar.events", "drive", "gmail.send"] as const;

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
        <div>
          <h2>Delegación de Workspace</h2>
          <p>Cuenta institucional usada por la integración para actuar en nombre de las salas.</p>
        </div>
      </header>
      <div className="form-grid">
        <label className="field field-wide">
          <span>Usuario delegado</span>
          <input type="email" name="serviceAccountSubject" defaultValue={subject} required />
        </label>
        <details className="workspace-technical-details field-wide">
          <summary>
            <Code2 size={16} aria-hidden="true" /> Ver permisos requeridos
          </summary>
          <div className="workspace-scope-chips">
            {SCOPES.map((scope) => (
              <span key={scope}>{scope}</span>
            ))}
          </div>
        </details>
      </div>
      <footer className="form-actions">
        <span className={`form-message${success ? " done" : ""}`} role="status">
          {message}
        </span>
        <div className="workspace-actions">
          <button className="secondary-action" type="button" onClick={test}>
            <TestTube2 size={17} />
            Probar
          </button>
          <button className="primary-action" type="submit">
            <Save size={17} />
            Guardar
          </button>
        </div>
      </footer>
    </form>
  );
}
