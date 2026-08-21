"use client";

import { RefreshCw } from "lucide-react";
import { useRouter } from "next/navigation";
import { useState } from "react";

type PendingMeetOperation = "PROVISIONAR" | "REPROGRAMAR" | "CONFIGURAR_MEET" | "CANCELAR";

const OPERATION_COPY: Readonly<Record<PendingMeetOperation, Readonly<{
  label: string;
  description: string;
}>>> = {
  PROVISIONAR: {
    label: "Crear reunión en Google",
    description: "Falta crear o terminar de provisionar el evento y su enlace Meet."
  },
  REPROGRAMAR: {
    label: "Actualizar fecha u horario",
    description: "Google todavía debe reflejar un cambio hecho en la agenda."
  },
  CONFIGURAR_MEET: {
    label: "Aplicar ajustes de Meet",
    description: "El Meet puede existir; faltan ajustes como cohosts, moderación o reportes."
  },
  CANCELAR: {
    label: "Cancelar en Google",
    description: "La reunión ya fue cancelada en la app y falta confirmarlo en Google."
  }
};

export function PendingMeetButton({
  operations
}: Readonly<{ operations: readonly PendingMeetOperation[] }>) {
  const router = useRouter();
  const [message, setMessage] = useState("");
  const [busy, setBusy] = useState(false);
  const breakdown = (Object.keys(OPERATION_COPY) as PendingMeetOperation[])
    .map((operation) => ({
      operation,
      count: operations.filter((current) => current === operation).length,
      ...OPERATION_COPY[operation]
    }))
    .filter(({ count }) => count > 0);
  const count = operations.length;

  async function synchronize() {
    setBusy(true);
    setMessage("Sincronizando con Google…");
    try {
      const response = await fetch("/api/v1/reuniones/provisionar-pendientes", { method: "POST" });
      const result = await response.json();
      setMessage(response.ok
        ? [
            `${result.sincronizadas ?? 0} completadas`,
            `${result.pendientesConfiguracion ?? 0} pendientes de configuración`,
            `${result.errores ?? 0} con error`,
            `${result.enProceso ?? 0} en proceso`
          ].join(" · ")
        : result.error ?? "No se pudo sincronizar.");
    } catch {
      setMessage("No se pudo conectar con el servicio de sincronización.");
    } finally {
      setBusy(false);
      router.refresh();
    }
  }

  return (
    <div className="pending-provision">
      <div className="pending-provision-detail">
        <strong>{count} {count === 1 ? "operación pendiente" : "operaciones pendientes"} con Google</strong>
        <small>{message || "Son tareas técnicas pendientes; el total por sí solo no implica que haya reuniones rotas."}</small>
        {breakdown.length ? (
          <ul className="pending-provision-breakdown" aria-label="Detalle de operaciones pendientes">
            {breakdown.map(({ operation, count: operationCount, label, description }) => (
              <li key={operation}>
                <strong>{operationCount}</strong>
                <span>
                  <b>{label}</b>
                  <small>{description}</small>
                </span>
              </li>
            ))}
          </ul>
        ) : null}
      </div>
      <button
        className="secondary-action"
        disabled={busy || count === 0}
        onClick={synchronize}
        type="button"
      >
        <RefreshCw size={17} /> {busy ? "Procesando…" : "Sincronizar con Google"}
      </button>
    </div>
  );
}
