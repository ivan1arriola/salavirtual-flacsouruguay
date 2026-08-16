"use client";

import { RefreshCw } from "lucide-react";
import { useRouter } from "next/navigation";
import { useState } from "react";

export function PendingMeetButton({ count }: Readonly<{ count: number }>) {
  const router = useRouter();
  const [message, setMessage] = useState("");
  const [busy, setBusy] = useState(false);

  async function synchronize() {
    setBusy(true);
    setMessage("Sincronizando con Google…");
    try {
      const response = await fetch("/api/v1/reuniones/provisionar-pendientes", { method: "POST" });
      const result = await response.json();
      setMessage(response.ok
        ? `${result.sincronizadas} sincronizadas, ${result.errores} con error, ${result.enProceso} en proceso.`
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
      <span>
        <strong>{count} sincronizaciones Google pendientes</strong>
        <small>{message || "Incluye creación, reprogramación, configuración de Meet y cancelaciones."}</small>
      </span>
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
