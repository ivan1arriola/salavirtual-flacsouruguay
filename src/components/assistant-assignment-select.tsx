"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";

type AssistantOption = Readonly<{ id: string; name: string }>;

export function AssistantAssignmentSelect({
  meetingId,
  assistants,
  currentAssistantId
}: Readonly<{
  meetingId: string;
  assistants: readonly AssistantOption[];
  currentAssistantId?: string | null;
}>) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [message, setMessage] = useState("");

  function assign(assistantId: string) {
    if (!assistantId || assistantId === currentAssistantId) return;
    setMessage("");
    startTransition(async () => {
      const response = await fetch("/api/v1/asistencia/asignaciones", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ instanciaSalaId: meetingId, asistenteId: assistantId })
      });
      const result = await response.json().catch(() => ({}));
      if (!response.ok) {
        setMessage(result.error ?? "No se pudo completar la asignación.");
        return;
      }
      router.refresh();
    });
  }

  return (
    <div className="assignment-select">
      <select
        aria-label="Asignar asistente"
        defaultValue={currentAssistantId ?? ""}
        disabled={pending}
        onChange={(event) => assign(event.target.value)}
      >
        <option value="">Asignar asistente</option>
        {assistants.map((assistant) => (
          <option key={assistant.id} value={assistant.id}>{assistant.name}</option>
        ))}
      </select>
      {message ? <small className="inline-error" role="alert">{message}</small> : null}
    </div>
  );
}
