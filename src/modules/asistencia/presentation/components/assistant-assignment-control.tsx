"use client";

import { UserCheck } from "lucide-react";
import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";

type Applicant = Readonly<{ id: string; name: string }>;

export function AssistantAssignmentControl({
  meetingId,
  applicants,
}: Readonly<{ meetingId: string; applicants: readonly Applicant[] }>) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [message, setMessage] = useState("");

  function assign(assistantId: string) {
    setMessage("");
    startTransition(async () => {
      const response = await fetch("/api/v1/asistencia/asignaciones", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ instanciaSalaId: meetingId, asistenteTecnicoId: assistantId }),
      });
      const result = await response.json().catch(() => ({}));
      if (!response.ok) {
        setMessage(result.error ?? "No se pudo completar la asignación.");
        return;
      }
      router.refresh();
    });
  }

  if (applicants.length === 0) {
    return <span className="muted-text">Sin postulantes</span>;
  }

  return (
    <div className="applicant-list">
      {applicants.map((applicant) => (
        <div className="applicant-row" key={applicant.id}>
          <span>{applicant.name}</span>
          <button
            className="icon-button"
            disabled={pending}
            onClick={() => assign(applicant.id)}
            title={`Asignar a ${applicant.name}`}
            type="button"
          >
            <UserCheck size={17} />
            <span className="sr-only">Asignar a {applicant.name}</span>
          </button>
        </div>
      ))}
      {message ? (
        <small className="inline-error" role="alert">
          {message}
        </small>
      ) : null}
    </div>
  );
}
