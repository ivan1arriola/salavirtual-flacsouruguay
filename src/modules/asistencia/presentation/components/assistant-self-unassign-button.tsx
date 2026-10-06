"use client";

import { UserMinus } from "lucide-react";
import { useRouter } from "next/navigation";
import { useState } from "react";

export function AssistantSelfUnassignButton({
  assignmentId,
  title
}: Readonly<{
  assignmentId: string;
  title: string;
}>) {
  const router = useRouter();
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  async function unassign() {
    const confirmed = window.confirm(
      `¿Darte de baja del monitoreo de “${title}”?\n\nLa reunión volverá a quedar disponible en la agenda abierta para que otra persona pueda cubrirla.`
    );
    if (!confirmed) return;

    setSaving(true);
    setError("");
    try {
      const response = await fetch("/api/v1/asistencia/asignaciones/desvincular", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ asignacionId: assignmentId })
      });
      const result = await response.json().catch(() => ({})) as Readonly<{
        error?: string;
        warning?: string | null;
      }>;

      if (!response.ok) {
        setError(result.error ?? "No se pudo registrar la baja.");
        return;
      }

      if (result.warning) window.alert(result.warning);
      router.refresh();
    } catch {
      setError("No se pudo comunicar el cambio al servidor.");
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="assistant-self-unassign-action">
      <button
        className="assistant-self-unassign-button"
        type="button"
        disabled={saving}
        onClick={unassign}
      >
        <UserMinus size={15} aria-hidden="true" />
        {saving ? "Dando de baja…" : "Darme de baja"}
      </button>
      {error ? <small className="assistant-action-error" role="status">{error}</small> : null}
    </div>
  );
}
