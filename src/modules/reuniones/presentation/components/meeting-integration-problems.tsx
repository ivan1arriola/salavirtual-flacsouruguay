"use client";

import { AlertTriangle, LoaderCircle, RefreshCw } from "lucide-react";
import { useRouter } from "next/navigation";
import { useState } from "react";

type IntegrationProblem = Readonly<{
  eventoProveedorId: string;
  ordinal: number;
  fechaLegible: string;
  hasMeet: boolean;
  error: string | null;
}>;

type RepairResult = Readonly<{
  estado: "SINCRONIZADA" | "ERROR" | "PENDIENTE_CONFIGURACION" | "EN_PROCESO" | "REQUIERE_REVISION";
  error?: string;
}>;

export function MeetingIntegrationProblems({
  problems,
  canRepair
}: Readonly<{
  problems: readonly IntegrationProblem[];
  canRepair: boolean;
}>) {
  const router = useRouter();
  const [busyId, setBusyId] = useState<string | null>(null);
  const [feedback, setFeedback] = useState<Readonly<Record<string, string>>>({});

  if (problems.length === 0) {
    return null;
  }

  async function repair(problem: IntegrationProblem) {
    setBusyId(problem.eventoProveedorId);
    setFeedback((current) => ({ ...current, [problem.eventoProveedorId]: "Reintentando con Google…" }));
    try {
      const response = await fetch("/api/v1/reuniones/provisionar-pendientes", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          eventoProveedorId: problem.eventoProveedorId,
          operacion: problem.hasMeet ? "CONFIGURAR_MEET" : "PROVISIONAR"
        })
      });
      const result = await response.json().catch(() => ({}));
      if (!response.ok) {
        setFeedback((current) => ({
          ...current,
          [problem.eventoProveedorId]: result.error ?? "No se pudo reintentar la integración."
        }));
        return;
      }

      const repaired = (result.resultados as readonly RepairResult[] | undefined)?.[0];
      if (repaired?.estado === "SINCRONIZADA") {
        setFeedback((current) => ({ ...current, [problem.eventoProveedorId]: "Corregido." }));
        router.refresh();
        return;
      }

      const message =
        repaired?.error ??
        (repaired?.estado === "PENDIENTE_CONFIGURACION"
          ? "Falta completar la configuración de Google Workspace."
          : repaired?.estado === "EN_PROCESO"
            ? "La sincronización ya está siendo procesada."
            : "El problema continúa y requiere revisión.");
      setFeedback((current) => ({ ...current, [problem.eventoProveedorId]: message }));
      router.refresh();
    } catch {
      setFeedback((current) => ({
        ...current,
        [problem.eventoProveedorId]: "No se pudo conectar con el servicio de sincronización."
      }));
    } finally {
      setBusyId(null);
    }
  }

  return (
    <section className="content-section" aria-labelledby="meet-integration-problems-title">
      <div className="section-heading">
        <div>
          <h2 id="meet-integration-problems-title">Problemas de Google Meet</h2>
          <p>Solo aparecen los encuentros cuya integración necesita atención.</p>
        </div>
        <span className="status status-error">
          <AlertTriangle size={14} />
          {problems.length}
        </span>
      </div>

      <ul className="settings-list">
        {problems.map((problem) => {
          const busy = busyId === problem.eventoProveedorId;
          return (
            <li key={problem.eventoProveedorId}>
              <span>
                <strong>
                  Encuentro {problem.ordinal} · {problem.fechaLegible}
                </strong>
                <small>
                  {problem.error ??
                    (problem.hasMeet
                      ? "El Meet existe, pero su configuración quedó incompleta."
                      : "No se pudo completar la creación del Meet.")}
                </small>
                {feedback[problem.eventoProveedorId] &&
                feedback[problem.eventoProveedorId] !== problem.error ? (
                  <small role="status">{feedback[problem.eventoProveedorId]}</small>
                ) : null}
              </span>
              {canRepair ? (
                <button
                  className="secondary-action"
                  disabled={busyId !== null}
                  onClick={() => repair(problem)}
                  type="button"
                >
                  {busy ? <LoaderCircle className="button-spinner" size={16} /> : <RefreshCw size={16} />}
                  {busy ? "Reintentando…" : problem.hasMeet ? "Reintentar configuración" : "Reintentar Meet"}
                </button>
              ) : (
                <span className="status status-warning">Requiere Administración</span>
              )}
            </li>
          );
        })}
      </ul>
    </section>
  );
}
