"use client";

import { RefreshCw } from "lucide-react";
import { useRouter } from "next/navigation";
import { useEffect } from "react";

export function OperationalAutoRefresh({
  enabled,
  seconds = 30
}: Readonly<{ enabled: boolean; seconds?: number }>) {
  const router = useRouter();

  useEffect(() => {
    if (!enabled) return;
    const timer = window.setInterval(() => {
      if (document.visibilityState === "visible") router.refresh();
    }, seconds * 1000);
    return () => window.clearInterval(timer);
  }, [enabled, router, seconds]);

  if (!enabled) return null;

  return (
    <span className="muted-text" title="Solo se actualiza mientras esta consola está abierta">
      <RefreshCw size={13} aria-hidden="true" /> Actualización automática cada {seconds} s
    </span>
  );
}
