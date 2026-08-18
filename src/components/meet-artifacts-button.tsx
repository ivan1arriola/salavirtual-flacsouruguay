"use client";

import { FolderSync } from "lucide-react";
import { useRouter } from "next/navigation";
import { useState } from "react";

type SyncSummary = Readonly<{
  procesadas: number;
  archivos: number;
  sinRegistroFinalizado: number;
  artefactosPendientes: number;
  noGrabadas: number;
  errores: number;
}>;

export function MeetArtifactsButton({ count }: Readonly<{ count: number }>) {
  const router = useRouter();
  const [summary, setSummary] = useState<SyncSummary | null>(null);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  async function synchronize() {
    setBusy(true);
    setSummary(null);
    setError("");
    try {
      const response = await fetch("/api/v1/reuniones/sincronizar-archivos", { method: "POST" });
      const result = await response.json().catch(() => ({}));
      if (response.ok) {
        setSummary(result as SyncSummary);
        router.refresh();
      } else {
        setError(result.error ?? "No se pudieron buscar los archivos en Google Meet.");
      }
    } catch {
      setError("No se pudo conectar con Google Meet. Intenta nuevamente.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="pending-provision">
      <span>
        <strong>{busy ? "Buscando archivos en Google Meet…" : "Grabaciones y archivos de Meet"}</strong>
        {summary ? (
          <>
            <small>
              Revisión terminada: {summary.procesadas} {summary.procesadas === 1 ? "reunión revisada" : "reuniones revisadas"}, {summary.archivos} {summary.archivos === 1 ? "archivo nuevo" : "archivos nuevos"}
              {` y ${summary.errores} ${summary.errores === 1 ? "error" : "errores"}.`}
            </small>
            {summary.noGrabadas > 0 ? (
              <small>
                {summary.noGrabadas} {summary.noGrabadas === 1 ? "reunión que requería grabación terminó sin grabarse" : "reuniones que requerían grabación terminaron sin grabarse"}.
              </small>
            ) : null}
            {summary.artefactosPendientes > 0 ? (
              <small>
                {summary.artefactosPendientes} {summary.artefactosPendientes === 1 ? "reunión tiene" : "reuniones tienen"} archivos que Google todavía está terminando de generar. Se volverán a revisar automáticamente.
              </small>
            ) : null}
            {summary.sinRegistroFinalizado > 0 ? (
              <small>
                {summary.sinRegistroFinalizado} {summary.sinRegistroFinalizado === 1 ? "reunión no tiene" : "reuniones no tienen"} todavía un registro finalizado disponible en Google Meet. Puedes volver a buscar sus archivos más adelante.
              </small>
            ) : null}
          </>
        ) : (
          <small>
            {error || `${count} ${count === 1 ? "reunión finalizada" : "reuniones finalizadas"} de los últimos 30 días ${count === 1 ? "puede revisarse" : "pueden revisarse"} para buscar grabaciones, transcripciones, asistencia y notas.`}
          </small>
        )}
      </span>
      <button className="secondary-action" disabled={busy || count === 0} onClick={synchronize} type="button">
        <FolderSync size={17} /> {busy ? "Actualizando…" : "Actualizar archivos"}
      </button>
    </div>
  );
}
