"use client";

import { Hand, X } from "lucide-react";
import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";

export function AssistantInterestButton({
  meetingId,
  interested
}: Readonly<{ meetingId: string; interested: boolean }>) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [message, setMessage] = useState("");

  function updateInterest() {
    setMessage("");
    startTransition(async () => {
      const response = await fetch("/api/v1/asistencia/postulaciones", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          instanciaSalaId: meetingId,
          accion: interested ? "RETIRAR" : "POSTULAR"
        })
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
    <div className="row-action">
      <button
        className={interested ? "secondary-action" : "primary-action"}
        disabled={pending}
        onClick={updateInterest}
        type="button"
      >
        {interested ? <X size={16} /> : <Hand size={16} />}
        {pending ? "Actualizando…" : interested ? "Retirar" : "Postularme"}
      </button>
      {message ? <small className="inline-error" role="alert">{message}</small> : null}
    </div>
  );
}
