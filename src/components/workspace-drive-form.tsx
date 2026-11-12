"use client";

import { FolderCheck, Save, ShieldCheck, TestTube2 } from "lucide-react";
import { useState } from "react";
import {
  prepareDriveHostAccess,
  saveWorkspaceSection,
  testWorkspaceSection
} from "./workspace-config.client";

export function WorkspaceDriveForm({ folderId }: Readonly<{ folderId: string }>) {
  const [message, setMessage] = useState("");
  const [success, setSuccess] = useState(false);

  async function save(formData: FormData) {
    setMessage("Guardando…");
    const result = await saveWorkspaceSection({
      seccion: "DRIVE",
      driveDestinationId: formData.get("driveDestinationId")
    });
    setSuccess(result.ok);
    setMessage(result.message);
  }

  async function test() {
    setMessage("Probando acceso a Drive…");
    const result = await testWorkspaceSection("DRIVE");
    setSuccess(result.ok);
    setMessage(result.message);
  }

  async function prepareAccess() {
    setMessage("Dando acceso a las salas Meet…");
    const result = await prepareDriveHostAccess();
    setSuccess(result.ok);
    setMessage(result.message);
  }

  return (
    <form className="form-section workspace-config" action={save}>
      <header className="form-section-title">
        <FolderCheck size={22} aria-hidden="true" />
        <div>
          <h2>Destino de Drive</h2>
          <p>Carpeta institucional para archivos generados.</p>
        </div>
      </header>
      <div className="form-grid">
        <label className="field field-wide">
          <span>ID de carpeta Drive</span>
          <input name="driveDestinationId" defaultValue={folderId} required />
        </label>
      </div>
      <footer className="form-actions">
        <span className={`form-message${success ? " done" : ""}`} role="status">
          {message}
        </span>
        <div className="workspace-actions">
          <button className="secondary-action" type="button" onClick={prepareAccess}>
            <ShieldCheck size={17} />
            Acceso a salas
          </button>
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
