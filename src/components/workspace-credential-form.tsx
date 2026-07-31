"use client";

import { KeyRound, Save, TestTube2 } from "lucide-react";
import { useState } from "react";
import {
  saveWorkspaceSection,
  testWorkspaceSection
} from "./workspace-config.client";

export function WorkspaceCredentialForm({
  email,
  privateKeyConfigured
}: Readonly<{ email: string; privateKeyConfigured: boolean }>) {
  const [message, setMessage] = useState("");
  const [success, setSuccess] = useState(false);

  async function save(formData: FormData) {
    setMessage("Guardando…");
    const result = await saveWorkspaceSection({
      seccion: "CREDENCIAL",
      serviceAccountEmail: formData.get("serviceAccountEmail"),
      privateKey: formData.get("privateKey")
    });
    setSuccess(result.ok);
    setMessage(result.message);
  }

  async function test() {
    setMessage("Probando credencial…");
    const result = await testWorkspaceSection("CREDENCIAL");
    setSuccess(result.ok);
    setMessage(result.message);
  }

  return (
    <form className="form-section workspace-config" action={save}>
      <header className="form-section-title">
        <KeyRound size={22} aria-hidden="true" />
        <div><h2>Cuenta de servicio</h2><p>Email visible y clave privada protegida.</p></div>
      </header>
      <div className="form-grid">
        <label className="field field-wide">
          <span>Email de cuenta de servicio</span>
          <input type="email" name="serviceAccountEmail" defaultValue={email} required />
        </label>
        <label className="field field-wide">
          <span>Clave privada PEM</span>
          <textarea
            name="privateKey"
            rows={5}
            autoComplete="off"
            placeholder={privateKeyConfigured ? "Clave configurada · dejar vacío para conservarla" : "-----BEGIN PRIVATE KEY-----"}
          />
        </label>
        <p className="config-secret-state field-wide">
          {privateKeyConfigured ? "Clave privada configurada y cifrada." : "Clave privada pendiente."}
        </p>
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
