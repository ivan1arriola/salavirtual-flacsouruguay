"use client";

import { Archive, Plus, RotateCcw } from "lucide-react";
import { useEffect, useState } from "react";
import { WorkspaceCredentialForm } from "./workspace-credential-form";

type LegacyCredential = Readonly<{
  id: string;
  serviceAccountEmail: string | null;
  privateKeyConfigurada: boolean;
  activa: boolean;
  version: number;
}>;

export function WorkspaceLegacyCredentials() {
  const [credentials, setCredentials] = useState<readonly LegacyCredential[]>([]);
  const [loading, setLoading] = useState(true);
  const [message, setMessage] = useState("");
  const [newId, setNewId] = useState<string | null>(null);

  async function reload() {
    setLoading(true);
    try {
      const response = await fetch("/api/v1/configuracion/google-workspace", { cache: "no-store" });
      const body = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(body.error ?? "No se pudieron cargar las credenciales Legacy.");
      setCredentials(Array.isArray(body.legacyCredentials) ? body.legacyCredentials : []);
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "No se pudieron cargar las credenciales Legacy.");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => { void reload(); }, []);

  async function deactivate(id: string) {
    setMessage("Desactivando credencial…");
    const response = await fetch(`/api/v1/configuracion/google-workspace?id=${encodeURIComponent(id)}`, {
      method: "DELETE"
    });
    const body = await response.json().catch(() => ({}));
    setMessage(response.ok ? body.message ?? "Credencial desactivada." : body.error ?? "No se pudo desactivar.");
    if (response.ok) await reload();
  }

  function addCredential() {
    setNewId(`legacy:${crypto.randomUUID()}`);
  }

  return (
    <section className="content-section settings-wide">
      <div className="section-heading">
        <div>
          <h2>Compatibilidad histórica</h2>
          <p>Estas cuentas nunca crean reuniones nuevas. Solo se prueban cuando la Principal no puede administrar un Meet existente.</p>
        </div>
        <Archive size={20} aria-hidden="true" />
      </div>

      {loading ? <p className="form-message">Cargando credenciales…</p> : null}

      <div className="settings-grid">
        {credentials.map((credential) => (
          <div key={credential.id}>
            <WorkspaceCredentialForm
              credentialId={credential.id}
              email={credential.serviceAccountEmail ?? ""}
              privateKeyConfigured={credential.privateKeyConfigurada}
              title={credential.activa ? "Credencial histórica" : "Credencial histórica desactivada"}
              description="Solo para espacios Meet históricos creados con esta cuenta de servicio."
              onSaved={reload}
            />
            {credential.activa ? (
              <button className="secondary-action" type="button" onClick={() => void deactivate(credential.id)}>
                <Archive size={16} />Desactivar
              </button>
            ) : null}
          </div>
        ))}
      </div>

      {newId ? (
        <div>
          <WorkspaceCredentialForm
            credentialId={newId}
            email=""
            privateKeyConfigured={false}
            title="Nueva credencial histórica"
            description="Guardala una sola vez y quedará cifrada en la base."
            onSaved={async () => {
              await reload();
              setNewId(null);
            }}
          />
          <button className="secondary-action" type="button" onClick={() => setNewId(null)}>
            <RotateCcw size={16} />Cancelar
          </button>
        </div>
      ) : (
        <button className="secondary-action" type="button" onClick={addCredential}>
          <Plus size={16} />Agregar credencial histórica
        </button>
      )}

      <p className="form-message" role="status">{message}</p>
    </section>
  );
}
