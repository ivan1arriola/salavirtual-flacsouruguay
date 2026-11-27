"use client";

import { Check, Copy } from "lucide-react";
import { useState } from "react";

const MENSAJES = {
  copiado: "ID copiado",
  error: "No se pudo copiar el ID. Seleccionalo y copialo manualmente.",
} as const;

export function ZoomCopyIdButton({
  meetingId,
  contexto,
}: Readonly<{
  meetingId: string;
  /** Identifica el encuentro para dar un nombre accesible a la acción. */
  contexto?: string;
}>) {
  const [resultado, setResultado] = useState<keyof typeof MENSAJES | null>(null);

  async function copy(): Promise<void> {
    try {
      await navigator.clipboard.writeText(meetingId);
      setResultado("copiado");
    } catch {
      setResultado("error");
    }
    window.setTimeout(() => setResultado(null), 4000);
  }

  return (
    <span className="zoom-copy-id-container">
      <button
        aria-label={contexto ? `Copiar ID de reunión de ${contexto}` : undefined}
        className="secondary-action"
        onClick={copy}
        title="Copiar ID de reunión Zoom"
        type="button"
      >
        {resultado === "copiado" ? (
          <Check size={14} aria-hidden="true" />
        ) : (
          <Copy size={14} aria-hidden="true" />
        )}
        <span>{resultado === "copiado" ? "Copiado" : "Copiar ID"}</span>
      </button>
      <span role="status" className="sr-only">
        {resultado ? MENSAJES[resultado] : ""}
      </span>
      {resultado === "error" ? <small className="zoom-join-error">{MENSAJES.error}</small> : null}
    </span>
  );
}
