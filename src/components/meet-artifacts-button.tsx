"use client";

import { FolderSync } from "lucide-react";
import { useRouter } from "next/navigation";
import { useState } from "react";

export function MeetArtifactsButton({ count }: Readonly<{ count: number }>) {
  const router = useRouter();
  const [message, setMessage] = useState("");
  const [busy, setBusy] = useState(false);

  async function synchronize() {
    setBusy(true);
    setMessage("Buscando grabaciones y archivos en Meet…");
    const response = await fetch("/api/v1/reuniones/sincronizar-archivos", { method: "POST" });
    const result = await response.json().catch(() => ({}));
    setBusy(false);
    setMessage(response.ok
      ? `${result.archivos} archivos nuevos; ${result.pendientes} reuniones aún pendientes; ${result.errores} con error.`
      : result.error ?? "No se pudieron sincronizar los archivos.");
    router.refresh();
  }

  return (
    <div className="pending-provision">
      <span>
        <strong>Grabaciones y archivos de Meet</strong>
        <small>{message || `${count} reuniones finalizadas pueden revisarse.`}</small>
      </span>
      <button className="secondary-action" disabled={busy || count === 0} onClick={synchronize} type="button">
        <FolderSync size={17} /> {busy ? "Actualizando…" : "Actualizar grabaciones"}
      </button>
    </div>
  );
}
