"use client";

import { KeyRound, Plus, Save, Trash2, Video } from "lucide-react";
import { useRouter } from "next/navigation";
import { useState } from "react";

export type MeetHostVisible = Readonly<{
  id: string;
  nombre: string;
  emailOrganizador: string | null;
  prioridad: number;
  limiteConcurrente: number | null;
  tieneLicencia: boolean;
  activa: boolean;
  passwordConfigurada: boolean;
  enUso: boolean;
}>;

export function MeetHostsConfig({ hosts }: Readonly<{ hosts: readonly MeetHostVisible[] }>) {
  const router = useRouter();
  const [message, setMessage] = useState("");
  const [success, setSuccess] = useState(false);
  const [saving, setSaving] = useState<string | null>(null);

  async function createHost(formData: FormData) {
    setSaving("new");
    setMessage("Guardando cuenta…");
    const result = await request("POST", payloadFromForm(formData, true));
    setSuccess(result.ok);
    setMessage(result.message);
    setSaving(null);
    if (result.ok) router.refresh();
  }

  async function updateHost(host: MeetHostVisible, formData: FormData) {
    setSaving(host.id);
    setMessage(`Guardando ${host.nombre}…`);
    const result = await request("PUT", {
      id: host.id,
      ...payloadFromForm(formData, false),
      notificarCambioPassword: formData.get("notificarCambioPassword") === "on"
    });
    setSuccess(result.ok);
    setMessage(result.message);
    setSaving(null);
    if (result.ok) router.refresh();
  }

  async function deleteHost(host: MeetHostVisible) {
    if (!window.confirm(`¿Eliminar ${host.nombre}? Esta acción no se puede deshacer.`)) return;

    setSaving(host.id);
    setMessage(`Eliminando ${host.nombre}…`);
    const result = await request("DELETE", { id: host.id });
    setSuccess(result.ok);
    setMessage(result.message);
    setSaving(null);
    if (result.ok) router.refresh();
  }

  return (
    <div className="settings-grid settings-workspace-grid">
      <form className="form-section workspace-config" action={createHost}>
        <header className="form-section-title">
          <Plus size={22} aria-hidden="true" />
          <div><h2>Agregar cuenta organizadora</h2><p>La cuenta queda disponible para nuevas reuniones según su prioridad.</p></div>
        </header>
        <div className="form-grid">
          <label className="field">
            <span>Nombre</span>
            <input name="nombre" placeholder="Sala principal" required />
          </label>
          <label className="field">
            <span>Correo de Google Workspace</span>
            <input type="email" name="email" placeholder="sala@flacso.edu.uy" required />
          </label>
          <label className="field">
            <span>Contraseña</span>
            <input type="password" name="password" minLength={8} autoComplete="new-password" required />
          </label>
          <label className="field">
            <span>Prioridad</span>
            <input type="number" name="prioridad" min={1} max={1000} defaultValue={hosts.length + 1} required />
          </label>
          <label className="field">
            <span>Límite concurrente</span>
            <input type="number" name="limiteConcurrente" min={1} max={100} placeholder="Sin límite adicional" />
          </label>
          <label className="check-field"><input type="checkbox" name="tieneLicencia" defaultChecked /><span>Disponible para alojar reuniones</span></label>
          <label className="check-field"><input type="checkbox" name="activa" defaultChecked /><span>Cuenta activa</span></label>
        </div>
        <footer className="form-actions">
          <span className={`form-message${success ? " done" : ""}`} role="status">{saving === "new" ? message : ""}</span>
          <button className="primary-action" type="submit" disabled={saving !== null}><Plus size={17} />Agregar cuenta</button>
        </footer>
      </form>

      <section className="content-section settings-wide">
        <div className="section-heading">
          <div>
            <h2>Cuentas organizadoras</h2>
            <p>Podés cambiar prioridad, disponibilidad y contraseña. Después de cambiar una contraseña en Google Workspace, actualizala también acá para mantener las credenciales y avisos sincronizados.</p>
          </div>
          <Video size={22} aria-hidden="true" />
        </div>
        {hosts.length === 0 ? (
          <div className="empty-state"><Video size={24} /><p>No hay salas Meet configuradas.</p></div>
        ) : (
          <div className="settings-grid">
            {hosts.map((host) => (
              <form key={host.id} className="form-section workspace-config" action={(formData) => updateHost(host, formData)}>
                <header className="form-section-title">
                  <KeyRound size={20} aria-hidden="true" />
                  <div>
                    <h3>{host.nombre}</h3>
                    <p>{host.passwordConfigurada ? "Contraseña cifrada configurada" : "Falta configurar la contraseña"}</p>
                  </div>
                </header>
                <div className="form-grid">
                  <label className="field">
                    <span>Nombre</span>
                    <input name="nombre" defaultValue={host.nombre} required />
                  </label>
                  <label className="field">
                    <span>Correo de Google Workspace</span>
                    <input
                      type="email"
                      name="email"
                      defaultValue={host.emailOrganizador ?? ""}
                      readOnly={host.enUso}
                      title={host.enUso ? "La cuenta ya tiene reuniones asociadas. Agregá una nueva para reemplazarla." : undefined}
                      required
                    />
                  </label>
                  <label className="field">
                    <span>Nueva contraseña</span>
                    <input
                      type="password"
                      name="password"
                      minLength={8}
                      autoComplete="new-password"
                      placeholder={host.passwordConfigurada ? "Dejar vacío para conservarla" : "Configurar contraseña"}
                    />
                  </label>
                  <label className="field">
                    <span>Prioridad</span>
                    <input type="number" name="prioridad" min={1} max={1000} defaultValue={host.prioridad} required />
                  </label>
                  <label className="field">
                    <span>Límite concurrente</span>
                    <input type="number" name="limiteConcurrente" min={1} max={100} defaultValue={host.limiteConcurrente ?? ""} placeholder="Sin límite adicional" />
                  </label>
                  <label className="check-field"><input type="checkbox" name="tieneLicencia" defaultChecked={host.tieneLicencia} /><span>Disponible para alojar reuniones</span></label>
                  <label className="check-field"><input type="checkbox" name="activa" defaultChecked={host.activa} /><span>Cuenta activa</span></label>
                  <label className="check-field field-wide"><input type="checkbox" name="notificarCambioPassword" defaultChecked /><span>Si cambia la contraseña, notificar por el sistema y por correo a las personas con reuniones futuras en esta cuenta</span></label>
                </div>
                <footer className="form-actions">
                  <span className={`form-message${success ? " done" : ""}`} role="status">{saving === host.id ? message : ""}</span>
                  <button
                    className="secondary-action danger-action"
                    type="button"
                    disabled={saving !== null}
                    onClick={() => deleteHost(host)}
                  >
                    <Trash2 size={17} />Eliminar
                  </button>
                  <button className="primary-action" type="submit" disabled={saving !== null}><Save size={17} />Guardar cambios</button>
                </footer>
              </form>
            ))}
          </div>
        )}
        {saving === null && message ? <p className={`form-message${success ? " done" : ""}`} role="status">{message}</p> : null}
      </section>
    </div>
  );
}

function payloadFromForm(formData: FormData, requirePassword: boolean) {
  const password = String(formData.get("password") ?? "").trim();
  const limitRaw = String(formData.get("limiteConcurrente") ?? "").trim();
  return {
    nombre: String(formData.get("nombre") ?? ""),
    email: String(formData.get("email") ?? ""),
    prioridad: Number(formData.get("prioridad")),
    limiteConcurrente: limitRaw ? Number(limitRaw) : null,
    tieneLicencia: formData.get("tieneLicencia") === "on",
    activa: formData.get("activa") === "on",
    ...(requirePassword || password ? { password } : {})
  };
}

async function request(method: "POST" | "PUT" | "DELETE", payload: Record<string, unknown>) {
  try {
    const response = await fetch("/api/v1/configuracion/salas-meet", {
      method,
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload)
    });
    const result = await response.json().catch(() => ({}));
    return {
      ok: response.ok,
      message: response.ok ? result.message ?? "Cambios guardados." : result.error ?? "No se pudieron guardar los cambios."
    };
  } catch {
    return { ok: false, message: "No se pudo conectar con el servidor." };
  }
}
