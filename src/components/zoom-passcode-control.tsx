"use client";

import { useState } from "react";
import { LockKeyhole } from "lucide-react";

type CodeState = { enabled: boolean | null; code?: string | null };
export function ZoomPasscodeControl({ instanciaId }: { instanciaId: string }) {
  const [data, setData] = useState<CodeState | null>(null);
  const [loading, setLoading] = useState(false);
  const [revealed, setRevealed] = useState(false);
  const [error, setError] = useState("");
  const [locked, setLocked] = useState(false);

  async function call(method: "GET" | "PATCH", enabled?: boolean) {
    setLoading(true);
    setError("");
    setRevealed(false);
    if (method === "GET") {
      setLocked(false);
    }
    try {
      const response = await fetch(
        `/api/v1/reuniones/instancias/${encodeURIComponent(instanciaId)}/codigo-zoom`,
        {
          method,
          cache: "no-store",
          ...(method === "PATCH"
            ? { headers: { "Content-Type": "application/json" }, body: JSON.stringify({ enabled }) }
            : {}),
        },
      );
      const result = await response.json();
      if (!response.ok) {
        if (method === "PATCH" && response.status === 409) {
          setLocked(true);
        }
        throw new Error(result.error || "No se pudo consultar Zoom.");
      }
      if (method === "PATCH") {
        setLocked(false);
      }
      if (method === "PATCH") {
        // El código nuevo se consulta por separado; no se conserva en el cliente.
        const updated = await fetch(
          `/api/v1/reuniones/instancias/${encodeURIComponent(instanciaId)}/codigo-zoom`,
          { cache: "no-store" },
        );
        if (!updated.ok) {
          throw new Error("Cambio aplicado, pero no se pudo actualizar el código.");
        }
        setData(await updated.json());
      } else {
        setData(result);
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : "Error inesperado.");
    } finally {
      setLoading(false);
    }
  }

  return (
    <section aria-label="Código de acceso Zoom" style={{ display: "grid", gap: 10 }}>
      <strong>Código de acceso</strong>
      {data === null ? (
        <button type="button" disabled={loading} onClick={() => void call("GET")}>
          Consultar en Zoom
        </button>
      ) : (
        <>
          <span aria-live="polite">
            {data.enabled === null
              ? "Sin verificar"
              : data.enabled
                ? "Habilitado"
                : "Deshabilitado"}
          </span>
          {data.enabled && data.code ? (
            <div>
              <button type="button" onClick={() => setRevealed(!revealed)}>
                {revealed ? "Ocultar código" : "Mostrar código"}
              </button>
              {revealed ? (
                <code style={{ marginLeft: 12, overflowWrap: "anywhere" }}>{data.code}</code>
              ) : null}
            </div>
          ) : null}
          {locked ? (
            <span role="status" style={{ display: "inline-flex", alignItems: "center", gap: 6 }}>
              <LockKeyhole size={16} aria-hidden="true" /> Cambio bloqueado por Zoom. Revisá la
              política de seguridad de la cuenta.
            </span>
          ) : null}
          {data.enabled !== null ? (
            <button
              type="button"
              disabled={loading || locked}
              onClick={() => {
                const next = !data.enabled;
                if (
                  window.confirm(
                    `¿${next ? "Activar" : "Desactivar"} el código de acceso? Si esta reunión pertenece a una serie, el cambio afectará a todos sus encuentros.`,
                  )
                ) {
                  void call("PATCH", next);
                }
              }}
            >
              {data.enabled ? "Desactivar código" : "Activar código"}
            </button>
          ) : null}
          <button type="button" disabled={loading} onClick={() => void call("GET")}>
            Actualizar estado y restricciones
          </button>
        </>
      )}
      <small>
        Solo administración. Zoom puede exigir un código por política de la cuenta. Los cambios en
        reuniones compartidas afectan a toda la serie.
      </small>
      {loading ? <span aria-live="polite">Consultando Zoom…</span> : null}
      {error ? <p role="alert">{error}</p> : null}
    </section>
  );
}
