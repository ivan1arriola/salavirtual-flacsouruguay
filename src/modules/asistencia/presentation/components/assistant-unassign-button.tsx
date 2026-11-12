"use client";

import { UserMinus } from "lucide-react";
import { useRouter } from "next/navigation";
import { useState } from "react";

export function AssistantUnassignButton({
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
      `¿Quitar la asignación de “${title}”?\n\nLa reunión seguirá existiendo y el cambio quedará registrado en el historial.`
    );
    if (!confirmed) {
      return;
    }

    setSaving(true);
    setError("");
    try {
      const response = await fetch("/api/v1/asistencia/asignaciones/desvincular", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ asignacionId: assignmentId })
      });
      const result = (await response.json().catch(() => ({}))) as Readonly<{
        error?: string;
        warning?: string | null;
      }>;

      if (!response.ok) {
        setError(result.error ?? "No se pudo quitar la asignación.");
        return;
      }

      if (result.warning) {
        window.alert(result.warning);
      }
      router.refresh();
    } catch {
      setError("No se pudo comunicar el cambio al servidor.");
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="assistant-unassign-action">
      <button
        className="secondary-action danger-action assistant-unassign-button"
        type="button"
        disabled={saving}
        onClick={unassign}
      >
        <UserMinus size={16} />
        {saving ? "Quitando…" : "Quitar asignación"}
      </button>
      {error ? (
        <small className="assistant-action-error" role="status">
          {error}
        </small>
      ) : null}
    </div>
  );
}
