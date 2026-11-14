"use client";

import { BellRing, CalendarCheck2, LoaderCircle } from "lucide-react";
import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";

export function BulkMonitoringNotificationActions({
  pendingCount,
  coveredCount
}: Readonly<{
  pendingCount: number;
  coveredCount: number;
}>) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [activeAction, setActiveAction] = useState<"sin_asignar" | "asignadas" | null>(null);
  const [feedback, setFeedback] = useState<{ type: "success" | "error"; text: string } | null>(null);

  function notifyUnassigned() {
    if (pendingCount === 0) {
      alert("No hay reuniones sin asignar para notificar.");
      return;
    }
    const confirmed = window.confirm(
      `¿Deseas enviar un correo a todas las asistentes disponibles con las ${pendingCount} reuniones sin asignar?`
    );
    if (!confirmed) {
      return;
    }

    setActiveAction("sin_asignar");
    setFeedback(null);

    startTransition(async () => {
      try {
        const response = await fetch("/api/v1/asistencia/notificaciones", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ tipo: "SIN_ASIGNAR" })
        });
        const data = await response.json().catch(() => ({}));
        if (!response.ok) {
          throw new Error(data.error ?? "No se pudo completar el envío.");
        }
        setFeedback({ type: "success", text: data.message });
        router.refresh();
      } catch (err) {
        setFeedback({
          type: "error",
          text: err instanceof Error ? err.message : "Error al notificar reuniones sin asignar."
        });
      } finally {
        setActiveAction(null);
      }
    });
  }

  function notifyAssigned() {
    if (coveredCount === 0) {
      alert("No hay reuniones asignadas para notificar.");
      return;
    }
    const confirmed = window.confirm(
      `¿Deseas notificar a cada asistente su cronograma con las reuniones que tiene asignadas?`
    );
    if (!confirmed) {
      return;
    }

    setActiveAction("asignadas");
    setFeedback(null);

    startTransition(async () => {
      try {
        const response = await fetch("/api/v1/asistencia/notificaciones", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ tipo: "ASIGNADAS" })
        });
        const data = await response.json().catch(() => ({}));
        if (!response.ok) {
          throw new Error(data.error ?? "No se pudo completar el envío.");
        }
        setFeedback({ type: "success", text: data.message });
        router.refresh();
      } catch (err) {
        setFeedback({
          type: "error",
          text: err instanceof Error ? err.message : "Error al notificar reuniones asignadas."
        });
      } finally {
        setActiveAction(null);
      }
    });
  }

  return (
    <div className="coverage-bulk-actions">
      <details className="coverage-notify-menu">
        <summary className="secondary-action">Notificar ▾</summary>
        <div className="coverage-bulk-buttons coverage-notify-menu-items">
          <button
            type="button"
            className="secondary-action coverage-bulk-btn"
            disabled={isPending}
            onClick={notifyUnassigned}
            title="Renotificar a todas las asistentes las reuniones que aún no tienen asignación"
          >
            {activeAction === "sin_asignar" ? (
              <LoaderCircle size={16} className="spin" aria-hidden="true" />
            ) : (
              <BellRing size={16} aria-hidden="true" />
            )}
            <span>Renotificar sin asignar ({pendingCount})</span>
          </button>

          <button
            type="button"
            className="secondary-action coverage-bulk-btn"
            disabled={isPending}
            onClick={notifyAssigned}
            title="Enviar a cada asistente su cronograma de reuniones asignadas"
          >
            {activeAction === "asignadas" ? (
              <LoaderCircle size={16} className="spin" aria-hidden="true" />
            ) : (
              <CalendarCheck2 size={16} aria-hidden="true" />
            )}
            <span>Notificar reuniones asignadas ({coveredCount})</span>
          </button>
        </div>
      </details>

      {feedback ? (
        <div
          className={`coverage-bulk-feedback ${feedback.type === "success" ? "status-ok" : "status-error"}`}
          role="status"
        >
          {feedback.text}
        </div>
      ) : null}
    </div>
  );
}
