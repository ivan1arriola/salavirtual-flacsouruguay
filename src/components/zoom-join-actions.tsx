"use client";

import { Check, Copy, ExternalLink } from "lucide-react";
import { useState } from "react";

export function ZoomJoinActions({ url }: Readonly<{ url: string }>) {
  const [copied, setCopied] = useState(false);

  async function copy(): Promise<void> {
    try {
      await navigator.clipboard.writeText(url);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 1800);
    } catch {
      setCopied(false);
    }
  }

  return (
    <span className="zoom-join-actions">
      <a className="primary-action" href={url} rel="noreferrer" target="_blank">
        <ExternalLink size={16} aria-hidden="true" />
        Unirse
      </a>
      <button className="secondary-action" onClick={copy} title="Copiar enlace de Zoom" type="button">
        {copied ? <Check size={16} aria-hidden="true" /> : <Copy size={16} aria-hidden="true" />}
        <span role="status">{copied ? "Copiado" : "Copiar enlace"}</span>
      </button>
    </span>
  );
}
