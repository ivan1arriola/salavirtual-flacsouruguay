"use client";

import { Check, X } from "lucide-react";
import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";

export function AssistantAssignmentResponse({ assignmentId }: Readonly<{ assignmentId: string }>) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [message, setMessage] = useState("");

  function respond(accion: "ACEPTAR" | "RECHAZAR") {
    setMessage("");
    startTransition(async () => {
      const response = await fetch("/api/v1/asistencia/asignaciones", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ asignacionId: assignmentId, accion })
      });
      const result = await response.json().catch(() => ({}));
      if (!response.ok) {
        setMessage(result.error ?? "No se pudo responder la asignación.");
        return;
      }
      router.refresh();
    });
  }

  return (
    <div className="assignment-response">
      <button disabled={pending} onClick={() => respond("ACEPTAR")} type="button">
        <Check size={15} />Confirmar
      </button>
      <button className="secondary-action danger-action" disabled={pending} onClick={() => respond("RECHAZAR")} type="button">
        <X size={15} />No puedo
      </button>
      {message ? <small className="inline-error" role="alert">{message}</small> : null}
    </div>
  );
}
