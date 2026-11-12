"use client";

import { Check, Copy, ExternalLink } from "lucide-react";
import { useState } from "react";

const MENSAJES = {
  copiado: "Enlace copiado",
  error: "No se pudo copiar el enlace. Seleccionalo y copialo manualmente."
} as const;

export function ZoomJoinActions({
  url,
  contexto
}: Readonly<{
  url: string;
  /** Identifica el encuentro (por ejemplo "martes 10 de noviembre, 10:00") para dar un nombre accesible a cada acción repetida. */
  contexto?: string;
}>) {
  const [resultado, setResultado] = useState<keyof typeof MENSAJES | null>(null);

  async function copy(): Promise<void> {
    try {
      await navigator.clipboard.writeText(url);
      setResultado("copiado");
    } catch {
      setResultado("error");
    }
    window.setTimeout(() => setResultado(null), 4000);
  }

  return (
    <span className="zoom-join-actions">
      <a
        aria-label={contexto ? `Unirse a ${contexto} (se abre en una pestaña nueva)` : undefined}
        className="primary-action"
        href={url}
        rel="noreferrer"
        target="_blank"
      >
        <ExternalLink size={16} aria-hidden="true" />
        Unirse
        <span className="sr-only"> (se abre en una pestaña nueva)</span>
      </a>
      <button
        aria-label={contexto ? `Copiar enlace de ${contexto}` : undefined}
        className="secondary-action"
        onClick={copy}
        title="Copiar enlace de Zoom"
        type="button"
      >
        {resultado === "copiado" ? (
          <Check size={16} aria-hidden="true" />
        ) : (
          <Copy size={16} aria-hidden="true" />
        )}
        <span>{resultado === "copiado" ? "Copiado" : "Copiar enlace"}</span>
      </button>
      {/* El anuncio va fuera del botón: el contenido de un botón es presentacional para los lectores de pantalla. */}
      <span role="status" className="sr-only">
        {resultado ? MENSAJES[resultado] : ""}
      </span>
      {resultado === "error" ? <small className="zoom-join-error">{MENSAJES.error}</small> : null}
    </span>
  );
}
