"use client";

import { BellRing, UserRoundMinus, UserRoundX } from "lucide-react";
import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";

export function CoverageAssistanceActions({
  meetingId,
  requestId,
  covered,
  assignmentId,
  assistantName
}: Readonly<{
  meetingId: string;
  requestId: string;
  covered: boolean;
  assignmentId: string | null;
  assistantName: string | null;
}>) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [message, setMessage] = useState("");

  function cancelAssistance() {
    if (!window.confirm("La reunión quedará marcada como que no necesita monitoreo. ¿Continuar?")) return;
    run(async () => {
      const response = await fetch(`/api/v1/reuniones/${requestId}/encuentros/${meetingId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ accion: "CAMBIAR_ASISTENCIA", requiereAsistenciaTecnica: false })
      });
      return parseResponse(response, "El monitoreo fue cancelado.");
    });
  }

  function unassign() {
    if (!assignmentId) return;
    if (!window.confirm(
      `¿Desasignar a ${assistantName ?? "la persona asignada"} de este monitoreo?\n\nLa reunión seguirá requiriendo monitoreo y quedará pendiente de cobertura. No se cancelará el encuentro.`
    )) return;
    run(async () => {
      const response = await fetch("/api/v1/asistencia/asignaciones/desvincular", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ asignacionId: assignmentId })
      });
      return parseResponse(response, "Se desasignó al asistente. El monitoreo continúa pendiente de cobertura.");
    });
  }

  function renotify() {
    run(async () => {
      const response = await fetch("/api/v1/asistencia/notificaciones", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ instanciaSalaId: meetingId })
      });
      return parseResponse(response, "Los asistentes de monitoreo fueron notificados nuevamente.");
    });
  }

  function run(action: () => Promise<string>) {
    setMessage("");
    startTransition(async () => {
      try {
        setMessage(await action());
        router.refresh();
      } catch (error) {
        setMessage(error instanceof Error ? error.message : "No se pudo completar la operación.");
      }
    });
  }

  return (
    <div className="coverage-management-actions">
      {!covered ? (
        <button
          className="secondary-action coverage-notify-action"
          disabled={pending}
          onClick={renotify}
          title="Volver a avisar a todos los asistentes de monitoreo disponibles"
          type="button"
        >
          <BellRing size={16} />{pending ? "Procesando…" : "Volver a notificar"}
        </button>
      ) : null}
      {covered && assignmentId ? (
        <button
          className="secondary-action coverage-unassign-action"
          disabled={pending}
          onClick={unassign}
          type="button"
        >
          <UserRoundMinus size={16} />{pending ? "Procesando…" : "Desasignar asistente"}
        </button>
      ) : null}
      <button
        className="secondary-action coverage-cancel-action"
        disabled={pending}
        onClick={cancelAssistance}
        type="button"
      >
        <UserRoundX size={16} />Cancelar monitoreo
      </button>
      {message ? <small className="coverage-action-message" role="status">{message}</small> : null}
    </div>
  );
}

async function parseResponse(response: Response, fallback: string): Promise<string> {
  const result = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(result.error ?? "No se pudo completar la operación.");
  return [result.message ?? fallback, result.warning].filter(Boolean).join(" ");
}
