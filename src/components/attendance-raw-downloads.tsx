"use client";

import { Download, FileJson, LoaderCircle } from "lucide-react";
import { useState } from "react";

type Fuente = "meet" | "reports";
type Formato = "csv" | "json";

export function AttendanceRawDownloads({ instanciaId }: Readonly<{ instanciaId: string }>) {
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState("");

  async function descargar(fuente: Fuente, formato: Formato) {
    if (busy) return;
    const key = `${fuente}-${formato}`;
    setBusy(key);
    setError("");
    try {
      const response = await fetch(
        `/api/v1/reuniones/instancias/${encodeURIComponent(instanciaId)}/asistencia/exportar/${fuente}?formato=${formato}`,
        { credentials: "same-origin", cache: "no-store" }
      );
      if (!response.ok) {
        const body = await response.json().catch(() => ({}));
        throw new Error(body.error || `La exportación de ${fuente} no está disponible.`);
      }
      const blob = await response.blob();
      const contentDisposition = response.headers.get("Content-Disposition") ?? "";
      const match = /filename="([a-zA-Z0-9_.-]+)"/.exec(contentDisposition);
      const filename = match?.[1] ?? `asistencia_${instanciaId.replace(/[^a-zA-Z0-9_-]/g, "")}_${fuente}.${formato}`;
      const url = URL.createObjectURL(blob);
      try {
        const anchor = document.createElement("a");
        anchor.href = url;
        anchor.download = filename;
        document.body.appendChild(anchor);
        anchor.click();
        anchor.remove();
      } finally {
        URL.revokeObjectURL(url);
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : "No se pudo descargar el archivo.");
    } finally {
      setBusy(null);
    }
  }

  return (
    <section className="attendance-raw-export" aria-labelledby="attendance-raw-export-title">
      <div className="attendance-raw-export-intro">
        <h2 id="attendance-raw-export-title">Descargar datos por API</h2>
        <p>Exportá por separado todos los registros disponibles en la última planilla sincronizada. CSV para Excel o JSON para análisis técnico. No se agrupan ni concilian los eventos.</p>
      </div>
      <div className="attendance-raw-export-buttons">
        {(["meet", "reports"] as const).map((fuente) => (
          <div className="attendance-raw-export-source" key={fuente}>
            <button
              className="secondary-action attendance-raw-export-primary"
              type="button"
              onClick={() => descargar(fuente, "csv")}
              disabled={busy !== null}
              aria-busy={busy === `${fuente}-csv`}
            >
              {busy === `${fuente}-csv` ? <LoaderCircle size={16} className="attendance-export-spinner" /> : <Download size={16} />}
              <span>Descargar {fuente === "meet" ? "Meet" : "Reports"} (CSV)</span>
            </button>
            <button
              type="button"
              className="attendance-raw-export-json"
              onClick={() => descargar(fuente, "json")}
              disabled={busy !== null}
              aria-busy={busy === `${fuente}-json`}
              aria-label={`Descargar datos de ${fuente === "meet" ? "Meet" : "Reports"} en formato JSON`}
            >
              {busy === `${fuente}-json` ? <LoaderCircle size={15} className="attendance-export-spinner" /> : <FileJson size={15} />}
              JSON
            </button>
          </div>
        ))}
      </div>
      {error ? <p className="attendance-raw-export-error" role="alert">{error}</p> : null}
    </section>
  );
}
