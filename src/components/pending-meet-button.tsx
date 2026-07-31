"use client";

import { RefreshCw } from "lucide-react";
import { useRouter } from "next/navigation";
import { useState } from "react";

export function PendingMeetButton({ count }: Readonly<{ count: number }>) {
  const router = useRouter();
  const [message, setMessage] = useState("");
  const [busy, setBusy] = useState(false);

  async function provision() {
    setBusy(true);
    setMessage("Creando enlaces…");
    const response = await fetch("/api/v1/reuniones/provisionar-pendientes", {
      method: "POST"
    });
    const result = await response.json();
    setBusy(false);
    setMessage(
      response.ok
        ? `${result.sincronizadas} creados, ${result.errores} con error.`
        : result.error ?? "No se pudo provisionar."
    );
    router.refresh();
  }

  return (
    <div className="pending-provision">
      <span>
        <strong>{count} reuniones Meet pendientes</strong>
        <small>{message || "Requieren credenciales de Workspace activas."}</small>
      </span>
      <button
        className="secondary-action"
        disabled={busy || count === 0}
        onClick={provision}
        type="button"
      >
        <RefreshCw size={17} /> {busy ? "Procesando…" : "Crear enlaces"}
      </button>
    </div>
  );
}
