"use client";

import { Power, Save } from "lucide-react";
import { useState } from "react";
import { saveWorkspaceSection } from "./workspace-config.client";

export function WorkspaceStatusForm({ active }: Readonly<{ active: boolean }>) {
  const [message, setMessage] = useState("");
  const [success, setSuccess] = useState(false);

  async function save(formData: FormData) {
    setMessage("Guardando…");
    const result = await saveWorkspaceSection({
      seccion: "ESTADO",
      activa: formData.get("activa") === "on"
    });
    setSuccess(result.ok);
    setMessage(result.message);
  }

  return (
    <form className="form-section workspace-config" action={save}>
      <header className="form-section-title">
        <Power size={22} aria-hidden="true" />
        <div><h2>Estado de integración</h2><p>Habilita o pausa el aprovisionamiento con Google.</p></div>
      </header>
      <label className="check-field"><input type="checkbox" name="activa" defaultChecked={active} /><span>Integración activa</span></label>
      <footer className="form-actions">
        <span className={`form-message${success ? " done" : ""}`} role="status">{message}</span>
        <button className="primary-action" type="submit"><Save size={17} />Guardar</button>
      </footer>
    </form>
  );
}
