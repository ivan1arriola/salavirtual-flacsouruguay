"use client";

import { BellRing, UserRoundX } from "lucide-react";
import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";

export function CoverageAssistanceActions({
  meetingId,
  requestId,
  covered
}: Readonly<{ meetingId: string; requestId: string; covered: boolean }>) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [message, setMessage] = useState("");

  function cancelAssistance() {
    if (!window.confirm("La reunión quedará marcada como que no necesita asistencia. ¿Continuar?")) return;
    run(async () => {
      const response = await fetch(`/api/v1/reuniones/${requestId}/encuentros/${meetingId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ accion: "CAMBIAR_ASISTENCIA", requiereAsistencia: false })
      });
      return parseResponse(response, "La asistencia fue cancelada.");
    });
  }

  function renotify() {
    run(async () => {
      const response = await fetch("/api/v1/asistencia/notificaciones", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ instanciaSalaId: meetingId })
      });
      return parseResponse(response, "Los asistentes fueron notificados nuevamente.");
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
      <button
        className="secondary-action coverage-notify-action"
        disabled={pending || covered}
        onClick={renotify}
        title={covered ? "La reunión ya tiene cobertura" : "Volver a avisar a todos los asistentes disponibles"}
        type="button"
      >
        <BellRing size={16} />{pending ? "Procesando…" : "Volver a notificar"}
      </button>
      <button
        className="secondary-action coverage-cancel-action"
        disabled={pending}
        onClick={cancelAssistance}
        type="button"
      >
        <UserRoundX size={16} />Cancelar asistencia
      </button>
      {message ? <small className="coverage-action-message" role="status">{message}</small> : null}
    </div>
  );
}

async function parseResponse(response: Response, fallback: string): Promise<string> {
  const result = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(result.error ?? "No se pudo completar la operación.");
  return result.message ?? fallback;
}
