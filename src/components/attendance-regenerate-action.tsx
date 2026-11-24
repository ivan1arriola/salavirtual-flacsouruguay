"use client";

import { useState } from "react";
import { RefreshCw } from "lucide-react";
import { useRouter } from "next/navigation";

/** Qué decirle al administrador tras reintentar: un 404 de Zoom no es una sincronización terminada. */
export function mensajeRegeneracion(data: {
  estado?: string;
  resultados?: ReadonlyArray<{ sincronizacion: string }>;
}): string {
  if (data.estado === "ARTEFACTOS_PENDIENTES") {
    return "Google todavía está procesando los datos. Volvé a intentar más tarde.";
  }
  const resultados = data.resultados ?? [];
  if (
    resultados.length > 0 &&
    !resultados.some((r) => r.sincronizacion === "OK" || r.sincronizacion === "CONFLICTO")
  ) {
    return resultados.some((r) => r.sincronizacion === "ERROR")
      ? "No se pudo sincronizar con Zoom. Volvé a intentar más tarde."
      : "Zoom aún no entregó el reporte. Volvé a intentar más tarde.";
  }
  return "Sincronización terminada. Actualizando la vista…";
}

export function AttendanceRegenerateAction({ instanciaId }: Readonly<{ instanciaId: string }>) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [estado, setEstado] = useState("");

  async function actualizar() {
    if (busy) {
      return;
    }
    setBusy(true);
    setError("");
    setEstado("");
    try {
      const response = await fetch(
        `/api/v1/reuniones/instancias/${encodeURIComponent(instanciaId)}/asistencia/regenerar`,
        {
          method: "POST",
          cache: "no-store"
        }
      );
      const data = await response.json().catch(() => ({}));
      if (!response.ok) {
        throw new Error(data.detalle || data.error || "No fue posible actualizar la asistencia.");
      }
      setEstado(mensajeRegeneracion(data));
      router.refresh();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Error de conexión.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="attendance-refresh">
      <button className="primary-action" type="button" onClick={actualizar} disabled={busy} aria-busy={busy}>
        <RefreshCw size={16} aria-hidden="true" />
        {busy ? "Actualizando…" : "Reintentar asistencia"}
      </button>
      {error ? (
        <small role="alert" className="attendance-refresh-error">
          {error}
        </small>
      ) : null}
      {estado ? <small role="status">{estado}</small> : null}
    </div>
  );
}
