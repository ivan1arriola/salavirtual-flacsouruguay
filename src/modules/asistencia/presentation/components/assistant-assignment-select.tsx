"use client";

import { RefreshCw, Sparkles, UserCheck } from "lucide-react";
import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";

type AssistantOption = Readonly<{ id: string; name: string }>;
export type ApplicantOption = Readonly<{
  id: string;
  name: string;
  status?: "DISPONIBLE" | "MUY_PROXIMO" | "CONFLICTO";
  monthlyMinutes?: number;
  conflictDetail?: string;
}>;
type SuggestedAssistant = Readonly<{ id: string; name: string; reason: string }>;

export function AssistantAssignmentSelect({
  meetingId,
  assistants,
  currentAssistantId,
  applicants = [],
  suggestedAssistant = null
}: Readonly<{
  meetingId: string;
  assistants: readonly AssistantOption[];
  currentAssistantId?: string | null;
  applicants?: readonly ApplicantOption[];
  suggestedAssistant?: SuggestedAssistant | null;
}>) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [message, setMessage] = useState("");
  const [editing, setEditing] = useState(!currentAssistantId);
  const applicantIds = new Set(applicants.map(({ id }) => id));

  function assign(assistantId: string) {
    if (!assistantId || assistantId === currentAssistantId) {
      return;
    }
    setMessage("");
    startTransition(async () => {
      const response = await fetch("/api/v1/asistencia/asignaciones", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ instanciaSalaId: meetingId, asistenteTecnicoId: assistantId })
      });
      const result = await response.json().catch(() => ({}));
      if (!response.ok) {
        setMessage(result.error ?? "No se pudo completar la asignación.");
        return;
      }
      setEditing(false);
      router.refresh();
    });
  }

  return (
    <div className="assignment-contract">
      {currentAssistantId && !editing ? (
        <button
          className="secondary-action reassign-assistant-button"
          disabled={pending}
          onClick={() => setEditing(true)}
          type="button"
        >
          <RefreshCw size={16} />
          Reasignar persona
        </button>
      ) : null}
      {editing ? (
        <>
          <div className="assignment-applicants" aria-label="Postulantes">
            <div className="assignment-contract-label">
              <UserCheck size={15} aria-hidden="true" />
              <span>Postulantes</span>
              <strong>{applicants.length}</strong>
            </div>
            {applicants.length > 0 ? (
              <div className="assignment-chip-list">
                {applicants.map((applicant) => {
                  const statusClass =
                    applicant.status === "CONFLICTO"
                      ? " tone-conflict"
                      : applicant.status === "MUY_PROXIMO"
                        ? " tone-warning"
                        : applicant.status === "DISPONIBLE"
                          ? " tone-available"
                          : "";
                  const hours =
                    applicant.monthlyMinutes !== undefined
                      ? `${Math.round(applicant.monthlyMinutes / 60)} h`
                      : "";
                  const title = applicant.conflictDetail
                    ? `${applicant.name} (${applicant.conflictDetail})`
                    : applicant.status === "DISPONIBLE"
                      ? `Disponible · ${applicant.name}${hours ? ` (${hours} este mes)` : ""}`
                      : `Asignar a ${applicant.name}`;
                  return (
                    <button
                      className={`assignment-chip${statusClass}`}
                      disabled={pending || applicant.id === currentAssistantId}
                      key={applicant.id}
                      onClick={() => assign(applicant.id)}
                      title={title}
                      type="button"
                    >
                      <span>{applicant.name}</span>
                      {applicant.status ? (
                        <span
                          className={`applicant-status-dot status-${applicant.status.toLowerCase()}`}
                          aria-hidden="true"
                        />
                      ) : null}
                      {hours ? <span className="applicant-load">{hours}</span> : null}
                    </button>
                  );
                })}
              </div>
            ) : (
              <small className="muted-text">Sin postulantes</small>
            )}
          </div>
          {suggestedAssistant ? (
            <button
              className="assignment-suggestion"
              disabled={pending || suggestedAssistant.id === currentAssistantId}
              onClick={() => assign(suggestedAssistant.id)}
              title={`Asignar sugerencia: ${suggestedAssistant.name}`}
              type="button"
            >
              <Sparkles size={15} aria-hidden="true" />
              <span>
                <strong>{suggestedAssistant.name}</strong>
                <small>{suggestedAssistant.reason}</small>
              </span>
            </button>
          ) : null}
          <select
            aria-label={applicants.length > 0 ? "Asignación manual o postulantes" : "Asignación manual"}
            defaultValue={currentAssistantId ?? ""}
            disabled={pending}
            onChange={(event) => assign(event.target.value)}
          >
            <option value="">
              {applicants.length > 0 ? "Asignar asistente de monitoreo" : "Asignar manualmente"}
            </option>
            {assistants.map((assistant) => (
              <option key={assistant.id} value={assistant.id}>
                {assistant.name}
                {applicantIds.has(assistant.id) ? " · postulante" : ""}
              </option>
            ))}
          </select>
        </>
      ) : null}
      {message ? (
        <small className="inline-error" role="alert">
          {message}
        </small>
      ) : null}
    </div>
  );
}
