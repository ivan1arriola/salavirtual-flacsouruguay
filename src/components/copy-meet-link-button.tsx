"use client";

import { Check, Copy, ExternalLink } from "lucide-react";
import { useState } from "react";

export function CopyMeetLinkButton({
  url,
  title = "Copiar enlace de la reunión"
}: Readonly<{ url: string; title?: string }>) {
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
    <button
      className="copy-meet-button"
      onClick={copy}
      title={title}
      type="button"
    >
      {copied ? <Check size={14} /> : <Copy size={14} />}
      {copied ? "Copiado" : "Copiar link"}
    </button>
  );
}

export function MeetLinkActions({
  url,
  openClassName = "text-link",
  iconOnly = false,
  className = "",
  provider = "GOOGLE_MEET"
}: Readonly<{
  url: string;
  openClassName?: string;
  iconOnly?: boolean;
  className?: string;
  provider?: "GOOGLE_MEET" | "ZOOM" | "ZOOM_HISTORICO";
}>) {
  const openLabel = provider === "ZOOM" || provider === "ZOOM_HISTORICO" ? "Abrir Zoom" : "Abrir Meet";
  return (
    <span className={`meet-link-actions ${className}`.trim()}>
      <a
        className={openClassName}
        href={url}
        rel="noreferrer"
        target="_blank"
        title={openLabel}
      >
        <ExternalLink size={iconOnly ? 16 : 15} />
        <span className={iconOnly ? "sr-only" : ""}>{openLabel}</span>
      </a>
      <CopyMeetLinkButton url={url} />
    </span>
  );
}
