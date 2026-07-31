"use client";

import { Save } from "lucide-react";
import { useState } from "react";

type InitialConfig = Readonly<{
  serviceAccountEmail: string;
  serviceAccountSubject: string;
  driveDestinationId: string;
  activa: boolean;
}>;

export function WorkspaceConfigForm({
  initial
}: Readonly<{ initial: InitialConfig | null }>) {
  const [message, setMessage] = useState("");

  async function save(formData: FormData) {
    setMessage("Guardando…");
    const response = await fetch("/api/v1/configuracion/google-workspace", {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        serviceAccountEmail: formData.get("serviceAccountEmail"),
        privateKey: formData.get("privateKey"),
        serviceAccountSubject: formData.get("serviceAccountSubject"),
        driveDestinationId: formData.get("driveDestinationId"),
        activa: formData.get("activa") === "on"
      })
    });
    const result = await response.json();
    setMessage(response.ok ? "Configuración actualizada." : result.error ?? "No se pudo guardar.");
  }

  return (
    <form className="form-section workspace-config" action={save}>
      <div className="section-heading compact-heading">
        <div><h2>Google Workspace</h2><p>{initial ? "Credenciales configuradas." : "Pendiente de configurar."}</p></div>
      </div>
      <div className="form-grid">
        <label className="field field-wide"><span>Email de cuenta de servicio</span><input type="email" name="serviceAccountEmail" defaultValue={initial?.serviceAccountEmail} required /></label>
        <label className="field field-wide"><span>Usuario general delegado</span><input type="email" name="serviceAccountSubject" defaultValue={initial?.serviceAccountSubject} required /></label>
        <label className="field field-wide"><span>ID de carpeta Drive</span><input name="driveDestinationId" defaultValue={initial?.driveDestinationId} required /></label>
        <label className="field field-wide"><span>Clave privada PEM</span><textarea name="privateKey" rows={5} required placeholder={initial ? "Ingresar nuevamente para actualizar" : "-----BEGIN PRIVATE KEY-----"} /></label>
        <label className="check-field field-wide"><input type="checkbox" name="activa" defaultChecked={initial?.activa ?? true} /><span>Integración activa</span></label>
      </div>
      <footer className="form-actions"><span className="muted-text">{message}</span><button className="primary-action" type="submit"><Save size={17} />Guardar configuración</button></footer>
    </form>
  );
}
