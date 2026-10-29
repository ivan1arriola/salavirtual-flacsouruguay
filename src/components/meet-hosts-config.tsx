"use client";

import {
  CheckCircle2,
  KeyRound,
  Pencil,
  Plus,
  Save,
  Search,
  Trash2,
  TriangleAlert,
  Video,
  X
} from "lucide-react";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { filterMeetHosts, formatoLimiteConcurrente } from "./meet-hosts-config.domain";

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
  const [query, setQuery] = useState("");
  const [creating, setCreating] = useState(false);
  const [editingHostId, setEditingHostId] = useState<string | null>(null);
  const filteredHosts = filterMeetHosts(hosts, query);

  async function createHost(formData: FormData) {
    setSaving("new");
    setMessage("Guardando cuenta…");
    const result = await request("POST", payloadFromForm(formData, true));
    setSuccess(result.ok);
    setMessage(result.message);
    setSaving(null);
    if (result.ok) {
      setCreating(false);
      router.refresh();
    }
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
    if (result.ok) {
      setEditingHostId(null);
      router.refresh();
    }
  }

  async function deleteHost(host: MeetHostVisible) {
    if (!window.confirm(`¿Eliminar ${host.nombre}? Esta acción no se puede deshacer.`)) return;

    setSaving(host.id);
    setMessage(`Eliminando ${host.nombre}…`);
    const result = await request("DELETE", { id: host.id });
    setSuccess(result.ok);
    setMessage(result.message);
    setSaving(null);
    if (result.ok) {
      setEditingHostId(null);
      router.refresh();
    }
  }

  function openEditor(hostId: string) {
    setCreating(false);
    setEditingHostId((current) => current === hostId ? null : hostId);
    setMessage("");
  }

  return (
    <div className="settings-rooms">
      <div className="settings-list-toolbar">
        <label className="settings-search">
          <Search size={18} aria-hidden="true" />
          <span className="sr-only">Buscar salas</span>
          <input
            type="search"
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder="Buscar por nombre o correo"
          />
        </label>
        <button
          className="primary-action"
          type="button"
          onClick={() => {
            setCreating((current) => !current);
            setEditingHostId(null);
            setMessage("");
          }}
        >
          {creating ? <X size={17} /> : <Plus size={17} />}
          {creating ? "Cerrar formulario" : "Agregar sala"}
        </button>
      </div>

      {creating ? (
        <form className="form-section workspace-config settings-room-editor" action={createHost}>
          <header className="form-section-title">
            <Plus size={22} aria-hidden="true" />
            <div><h2>Agregar cuenta organizadora</h2><p>La cuenta quedará disponible para nuevas reuniones según su prioridad.</p></div>
          </header>
          <HostFields hostsCount={hosts.length} />
          <footer className="form-actions">
            <span className={`form-message${success ? " done" : ""}`} role="status">{saving === "new" ? message : ""}</span>
            <button className="primary-action" type="submit" disabled={saving !== null}><Plus size={17} />{saving === "new" ? "Agregando…" : "Agregar cuenta"}</button>
          </footer>
        </form>
      ) : null}

      <section className="content-section settings-room-list-section">
        <div className="section-heading settings-list-heading">
          <div>
            <h2>Cuentas organizadoras</h2>
            <p>{filteredHosts.length === hosts.length ? `${hosts.length} cuentas configuradas` : `${filteredHosts.length} resultados de ${hosts.length}`}</p>
          </div>
          <Video size={22} aria-hidden="true" />
        </div>

        {hosts.length === 0 ? (
          <div className="empty-state"><Video size={24} /><p>No hay salas configuradas.</p></div>
        ) : filteredHosts.length === 0 ? (
          <div className="settings-empty-search"><Search size={22} /><strong>No encontramos salas</strong><span>Probá con otro nombre o correo.</span></div>
        ) : (
          <div className="settings-room-list">
            {filteredHosts.map((host) => {
              const isEditing = editingHostId === host.id;
              const available = host.activa && host.tieneLicencia;
              return (
                <article className={`settings-room-row${isEditing ? " is-editing" : ""}`} key={host.id}>
                  <div className="settings-room-row__summary">
                    <span className={`settings-room-row__icon${available ? " is-ready" : " is-warning"}`}>
                      {available ? <CheckCircle2 size={19} /> : <TriangleAlert size={19} />}
                    </span>
                    <div className="settings-room-row__identity">
                      <strong>{host.nombre}</strong>
                      <span>{host.emailOrganizador ?? "Sin correo organizador"}</span>
                    </div>
                    <div className="settings-room-row__facts">
                      <span className={`settings-mini-status ${available ? "is-ok" : "is-warning"}`}>{available ? "Disponible" : "No disponible"}</span>
                      <small>Prioridad {host.prioridad}</small>
                      <small>{formatoLimiteConcurrente(host.limiteConcurrente)}</small>
                    </div>
                    <button className="secondary-action settings-room-row__edit" type="button" onClick={() => openEditor(host.id)}>
                      {isEditing ? <X size={16} /> : <Pencil size={16} />}
                      {isEditing ? "Cerrar" : "Editar"}
                    </button>
                  </div>

                  {isEditing ? (
                    <form className="settings-room-edit-form" action={(formData) => updateHost(host, formData)}>
                      <header>
                        <KeyRound size={19} aria-hidden="true" />
                        <div><strong>Editar {host.nombre}</strong><p>{host.passwordConfigurada ? "La contraseña cifrada está configurada." : "Esta cuenta necesita una contraseña."}</p></div>
                      </header>
                      <HostFields host={host} hostsCount={hosts.length} />
                      <div className="settings-risk-zone">
                        <div><strong>Eliminar esta sala</strong><span>Solo se permitirá si la cuenta no tiene reuniones activas que la necesiten.</span></div>
                        <button className="secondary-action danger-action" type="button" disabled={saving !== null} onClick={() => deleteHost(host)}><Trash2 size={17} />Eliminar</button>
                      </div>
                      <footer className="form-actions">
                        <span className={`form-message${success ? " done" : ""}`} role="status">{saving === host.id ? message : ""}</span>
                        <button className="primary-action" type="submit" disabled={saving !== null}><Save size={17} />{saving === host.id ? "Guardando…" : "Guardar cambios"}</button>
                      </footer>
                    </form>
                  ) : null}
                </article>
              );
            })}
          </div>
        )}
      </section>

      {saving === null && message ? <p className={`form-notice${success ? "" : " form-notice-error"}`} role="status">{message}</p> : null}
    </div>
  );
}

function HostFields({
  host,
  hostsCount
}: Readonly<{ host?: MeetHostVisible; hostsCount: number }>) {
  return (
    <div className="form-grid">
      <label className="field">
        <span>Nombre</span>
        <input name="nombre" defaultValue={host?.nombre} placeholder="Sala principal" required />
      </label>
      <label className="field">
        <span>Correo de Google Workspace</span>
        <input
          type="email"
          name="email"
          defaultValue={host?.emailOrganizador ?? ""}
          placeholder="sala@flacso.edu.uy"
          readOnly={host?.enUso}
          title={host?.enUso ? "La cuenta ya tiene reuniones asociadas. Agregá una nueva para reemplazarla." : undefined}
          required
        />
      </label>
      <label className="field">
        <span>{host ? "Nueva contraseña" : "Contraseña"}</span>
        <input
          type="password"
          name="password"
          minLength={8}
          autoComplete="new-password"
          placeholder={host?.passwordConfigurada ? "Dejar vacío para conservarla" : "Configurar contraseña"}
          required={!host}
        />
        {host ? <small>Dejala vacía para conservar la contraseña actual.</small> : null}
      </label>
      <label className="field">
        <span>Prioridad</span>
        <input type="number" name="prioridad" min={1} max={1000} defaultValue={host?.prioridad ?? hostsCount + 1} required />
      </label>
      <label className="field">
        <span>Límite de reuniones simultáneas</span>
        <input
          type="number"
          name="limiteConcurrente"
          min={1}
          max={100}
          defaultValue={host?.limiteConcurrente ?? ""}
          placeholder="1 (predeterminado)"
        />
        <small>Cantidad máxima de reuniones que esta sala puede alojar al mismo tiempo (ej: 2 para permitir reuniones simultáneas).</small>
      </label>
      <label className="check-field"><input type="checkbox" name="tieneLicencia" defaultChecked={host?.tieneLicencia ?? true} /><span>Disponible para alojar reuniones</span></label>
      <label className="check-field"><input type="checkbox" name="activa" defaultChecked={host?.activa ?? true} /><span>Cuenta activa</span></label>
      {host ? (
        <label className="check-field field-wide"><input type="checkbox" name="notificarCambioPassword" defaultChecked /><span>Si cambia la contraseña, avisar a las personas con reuniones futuras en esta cuenta.</span></label>
      ) : null}
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
