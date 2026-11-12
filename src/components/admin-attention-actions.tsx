"use client";

import { FolderSync, Loader2, RefreshCw, UserCheck } from "lucide-react";
import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";

export function AdminRetryMeetAction({
  eventoProveedorId,
  operacion = "PROVISIONAR",
  label = "Reintentar provisión de Meet (1 clic)"
}: Readonly<{
  eventoProveedorId?: string;
  operacion?: "PROVISIONAR" | "REPROGRAMAR" | "CONFIGURAR_MEET" | "CANCELAR";
  label?: string;
}>) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [feedback, setFeedback] = useState<{ text: string; isError: boolean } | null>(null);

  function retry() {
    setFeedback(null);
    startTransition(async () => {
      try {
        const response = await fetch("/api/v1/reuniones/provisionar-pendientes", {
          method: "POST",
          ...(eventoProveedorId
            ? {
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ eventoProveedorId, operacion })
              }
            : {})
        });
        const result = await response.json().catch(() => ({}));
        if (!response.ok) {
          setFeedback({
            text: result.error ?? "No se pudo reintentar la provisión.",
            isError: true
          });
          return;
        }
        const synced = result.sincronizadas ?? 0;
        const errs = result.errores ?? 0;
        setFeedback({
          text: `Completado: ${synced} sincronizada${synced === 1 ? "" : "s"}${errs > 0 ? `, ${errs} con error` : ""}.`,
          isError: errs > 0 && synced === 0
        });
        router.refresh();
      } catch {
        setFeedback({
          text: "Error de conexión al reintentar.",
          isError: true
        });
      }
    });
  }

  return (
    <div className="operations-attention-action-bar">
      <button
        className="operations-attention-btn tone-danger"
        disabled={pending}
        onClick={retry}
        type="button"
      >
        {pending ? <Loader2 className="animate-spin" size={14} /> : <RefreshCw size={14} />}
        <span>{pending ? "Reintentando…" : label}</span>
      </button>
      {feedback ? (
        <span className={`operations-attention-feedback${feedback.isError ? " is-error" : ""}`}>
          {feedback.text}
        </span>
      ) : null}
    </div>
  );
}

export function AdminSyncRecordingsAction({
  label = "Sincronizar grabaciones ahora"
}: Readonly<{
  label?: string;
}>) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [feedback, setFeedback] = useState<{ text: string; isError: boolean } | null>(null);

  function sync() {
    setFeedback(null);
    startTransition(async () => {
      try {
        const response = await fetch("/api/v1/reuniones/sincronizar-archivos", {
          method: "POST"
        });
        const result = await response.json().catch(() => ({}));
        if (!response.ok) {
          setFeedback({
            text: result.error ?? "No se pudo sincronizar las grabaciones.",
            isError: true
          });
          return;
        }
        const files = result.archivos ?? 0;
        const procs = result.procesadas ?? 0;
        setFeedback({
          text: `${procs} reuniones revisadas, ${files} archivos nuevos.`,
          isError: false
        });
        router.refresh();
      } catch {
        setFeedback({
          text: "Error de conexión al sincronizar.",
          isError: true
        });
      }
    });
  }

  return (
    <div className="operations-attention-action-bar">
      <button className="operations-attention-btn" disabled={pending} onClick={sync} type="button">
        {pending ? <Loader2 className="animate-spin" size={14} /> : <FolderSync size={14} />}
        <span>{pending ? "Sincronizando…" : label}</span>
      </button>
      {feedback ? (
        <span className={`operations-attention-feedback${feedback.isError ? " is-error" : ""}`}>
          {feedback.text}
        </span>
      ) : null}
    </div>
  );
}

export function AdminQuickAssignAction({
  meetingId,
  firstApplicant,
  assistants
}: Readonly<{
  meetingId: string;
  firstApplicant?: { id: string; name: string } | null;
  assistants: readonly { id: string; name: string }[];
}>) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [feedback, setFeedback] = useState<{ text: string; isError: boolean } | null>(null);

  function assign(assistantId: string) {
    if (!assistantId) {
      return;
    }
    setFeedback(null);
    startTransition(async () => {
      try {
        const response = await fetch("/api/v1/asistencia/asignaciones", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            instanciaSalaId: meetingId,
            asistenteTecnicoId: assistantId
          })
        });
        const result = await response.json().catch(() => ({}));
        if (!response.ok) {
          setFeedback({
            text: result.error ?? "No se pudo asignar asistente.",
            isError: true
          });
          return;
        }
        setFeedback({ text: "Asignado correctamente.", isError: false });
        router.refresh();
      } catch {
        setFeedback({ text: "Error de conexión.", isError: true });
      }
    });
  }

  return (
    <div className="operations-attention-action-bar">
      <div className="operations-attention-quick-assign">
        {firstApplicant ? (
          <button
            className="operations-attention-btn tone-warning"
            disabled={pending}
            onClick={() => assign(firstApplicant.id)}
            title={`Asignar a ${firstApplicant.name}`}
            type="button"
          >
            {pending ? <Loader2 className="animate-spin" size={14} /> : <UserCheck size={14} />}
            <span>{pending ? "Asignando…" : `Asignar a ${firstApplicant.name}`}</span>
          </button>
        ) : null}
        <select
          aria-label="Asignar asistente de monitoreo"
          className="operations-attention-quick-select"
          defaultValue=""
          disabled={pending}
          onChange={(e) => assign(e.target.value)}
        >
          <option value="">{firstApplicant ? "O asignar a otro asistente…" : "Asignar asistente…"}</option>
          {assistants.map((ast) => (
            <option key={ast.id} value={ast.id}>
              {ast.name}
            </option>
          ))}
        </select>
      </div>
      {feedback ? (
        <span className={`operations-attention-feedback${feedback.isError ? " is-error" : ""}`}>
          {feedback.text}
        </span>
      ) : null}
    </div>
  );
}
