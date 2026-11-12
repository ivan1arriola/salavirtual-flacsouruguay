"use client";

import { Save } from "lucide-react";
import { useRouter } from "next/navigation";
import { useState } from "react";
import type { RolUsuario } from "@/src/modules/usuarios/roles";

const ROLE_OPTIONS: ReadonlyArray<Readonly<{ value: RolUsuario; label: string }>> = [
  { value: "DOCENTE", label: "Docente" },
  { value: "ASISTENTE_TECNICO", label: "Asistente de monitoreo" },
  { value: "ADMINISTRACION", label: "Administracion" }
];

export function UserRoleForm({ userId, initialRole }: Readonly<{ userId: string; initialRole: RolUsuario }>) {
  const router = useRouter();
  const [role, setRole] = useState<RolUsuario>(initialRole);
  const [savedRole, setSavedRole] = useState<RolUsuario>(initialRole);
  const [message, setMessage] = useState("");
  const [saving, setSaving] = useState(false);

  async function save() {
    setSaving(true);
    setMessage("Guardando...");
    const response = await fetch(`/api/v1/usuarios/${encodeURIComponent(userId)}/rol`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ rol: role })
    });
    const result = await response.json();
    if (response.ok) {
      setSavedRole(result.rol);
      setMessage("Rol actualizado.");
      router.refresh();
    } else {
      setMessage(result.error ?? "No se pudo cambiar el rol.");
    }
    setSaving(false);
  }

  return (
    <section className="form-section account-form">
      <div className="section-heading compact-heading">
        <div>
          <h2>Rol y permisos</h2>
          <p>Define las funciones disponibles para esta persona.</p>
        </div>
      </div>
      <label className="field">
        <span>Tipo de usuario</span>
        <select value={role} onChange={(event) => setRole(event.target.value as RolUsuario)}>
          {ROLE_OPTIONS.map((option) => (
            <option key={option.value} value={option.value}>
              {option.label}
            </option>
          ))}
        </select>
      </label>
      <footer className="form-actions">
        <span className="muted-text" role="status">
          {message}
        </span>
        <button
          className="primary-action"
          type="button"
          disabled={saving || role === savedRole}
          onClick={save}
        >
          <Save size={17} />
          Guardar rol
        </button>
      </footer>
    </section>
  );
}
