"use client";

import { Hand, X } from "lucide-react";
import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";

export function AssistantInterestButton({
  meetingId,
  interested,
  disabledReason,
}: Readonly<{
  meetingId: string;
  interested: boolean;
  disabledReason?: string;
}>) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [message, setMessage] = useState("");
  const blocked = Boolean(disabledReason) && !interested;

  function updateInterest() {
    if (blocked) {
      return;
    }
    setMessage("");
    startTransition(async () => {
      const response = await fetch("/api/v1/asistencia/postulaciones", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          instanciaSalaId: meetingId,
          accion: interested ? "RETIRAR" : "POSTULAR",
        }),
      });
      const result = await response.json().catch(() => ({}));
      if (!response.ok) {
        setMessage(result.error ?? "No se pudo actualizar la postulación.");
        return;
      }
      router.refresh();
    });
  }

  return (
    <div className="row-action" data-tour="assistant-interest">
      <button
        className={interested ? "secondary-action" : "primary-action"}
        disabled={pending || blocked}
        onClick={updateInterest}
        title={blocked ? disabledReason : undefined}
        type="button"
      >
        {interested ? <X size={16} /> : <Hand size={16} />}
        {pending
          ? "Actualizando…"
          : interested
            ? "Retirar"
            : blocked
              ? "Conflicto horario"
              : "Postularme"}
      </button>
      {blocked && disabledReason ? <small className="muted-text">{disabledReason}</small> : null}
      {message ? (
        <small className="inline-error" role="alert">
          {message}
        </small>
      ) : null}
    </div>
  );
}
