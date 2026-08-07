"use client";

import { Check, Copy } from "lucide-react";
import { useState } from "react";

export function CopyMeetLinkButton({ url }: Readonly<{ url: string }>) {
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
      title="Copiar enlace de Google Meet"
      type="button"
    >
      {copied ? <Check size={14} /> : <Copy size={14} />}
      {copied ? "Copiado" : "Copiar link"}
    </button>
  );
}
