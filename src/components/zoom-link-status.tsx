"use client";

import { RefreshCw } from "lucide-react";
import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import type { EstadoEnlaceZoom, ResumenEnlaceZoom } from "@/src/modules/reuniones/estado-enlace-zoom.domain";

const ETIQUETAS: Record<EstadoEnlaceZoom, string> = {
  LISTO: "Enlace listo",
  ATENCION: "Enlace listo, cambios sin sincronizar",
  PENDIENTE: "Enlace pendiente",
  ERROR: "Error al crear el enlace"
};

export function ZoomLinkStatus({
  estado,
  esAdmin,
  eventoProveedorId,
  operacion
}: Readonly<{
  estado: EstadoEnlaceZoom;
  esAdmin: boolean;
  eventoProveedorId: string | null;
  operacion: ResumenEnlaceZoom["operacion"];
}>) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState("");

  function reintentar() {
    setError("");
    startTransition(async () => {
      const response = await fetch("/api/v1/reuniones/provisionar-pendientes", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ eventoProveedorId, operacion })
      });
      if (!response.ok) {
        const result = await response.json().catch(() => ({}));
        setError(result.error ?? "No se pudo reintentar.");
        return;
      }
      router.refresh();
    });
  }

  return (
    <span className={`status zoom-link-status is-${estado.toLowerCase()}`}>
      {ETIQUETAS[estado]}
      {esAdmin && estado !== "LISTO" && eventoProveedorId ? (
        <button className="secondary-action" disabled={pending} onClick={reintentar} type="button">
          <RefreshCw size={14} aria-hidden="true" />
          {pending ? "Reintentando…" : "Reintentar"}
        </button>
      ) : null}
      {error ? <small role="alert">{error}</small> : null}
    </span>
  );
}
