"use client";
import { useId, useState } from "react";
import { useRouter } from "next/navigation";

type Candidato = { id: string; titulo: string; programa: string; docente: string; fecha: string };

function mensajeError(status: number): string {
  if (status === 404) return "No se encontró el recurso solicitado.";
  if (status === 409) return "No se pudo completar: el estado o vínculo cambió.";
  if (status === 422) return "El encuentro seleccionado no es de Zoom.";
  return "No se pudo completar la operación.";
}

export function ZoomHistoricoControl({ ocurrenciaId, vinculado = false }: { ocurrenciaId: string; vinculado?: boolean }) {
  const router = useRouter();
  const id = useId();
  const [candidatos, setCandidatos] = useState<Candidato[] | null>(null);
  const [seleccion, setSeleccion] = useState("");
  const [cargando, setCargando] = useState(false);
  const [mensaje, setMensaje] = useState("");

  async function cargar() {
    setCargando(true);
    setMensaje("");
    try {
      const r = await fetch(`/api/v1/archivos/zoom/ocurrencias/${encodeURIComponent(ocurrenciaId)}/candidatos`);
      if (!r.ok) {
        setMensaje(mensajeError(r.status));
        return;
      }
      const datos = (await r.json()) as { candidatos: Candidato[] };
      setCandidatos(datos.candidatos);
    } catch {
      setMensaje("No se pudieron cargar los encuentros.");
    } finally {
      setCargando(false);
    }
  }

  async function vincular() {
    setCargando(true);
    setMensaje("");
    try {
      const r = await fetch(`/api/v1/archivos/zoom/ocurrencias/${encodeURIComponent(ocurrenciaId)}/vincular`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ eventoId: seleccion })
      });
      if (!r.ok) {
        setMensaje(mensajeError(r.status));
        return;
      }
      const datos = (await r.json()) as { advertencia?: string };
      setMensaje(datos.advertencia ?? "Vínculo registrado.");
      router.refresh();
    } catch {
      setMensaje("No se pudo vincular el encuentro.");
    } finally {
      setCargando(false);
    }
  }

  if (vinculado) {
    return mensaje ? <p className="zoom-control-feedback" aria-live="polite">{mensaje}</p> : null;
  }

  return (
    <div className="zoom-link-control">
      <div className="zoom-link-actions">
        <button type="button" className="secondary-action zoom-link-trigger" disabled={cargando} onClick={cargar}>
          Vincular a un encuentro
        </button>
        {cargando ? <span className="zoom-control-loading">Cargando…</span> : null}
      </div>
      {candidatos ? (
        candidatos.length === 0 ? (
          <p className="zoom-control-empty">No hay encuentros candidatos.</p>
        ) : (
          <div className="zoom-candidate-picker">
            <label htmlFor={id} className="zoom-candidate-label">Encuentro</label>
            <select
              id={id}
              className="zoom-candidate-select"
              value={seleccion}
              onChange={(e) => setSeleccion(e.target.value)}
              disabled={cargando}
            >
              <option value="">Seleccione un encuentro</option>
              {candidatos.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.titulo} · {c.programa} · {c.docente} · {new Date(c.fecha).toLocaleString("es-UY")}
                </option>
              ))}
            </select>
            <button
              type="button"
              className="primary-action zoom-candidate-confirm"
              disabled={!seleccion || cargando}
              onClick={vincular}
            >
              Confirmar
            </button>
          </div>
        )
      ) : null}
      <p className="zoom-control-feedback" aria-live="polite">{mensaje}</p>
    </div>
  );
}

export function ZoomReintentarArchivo({ archivoId }: { archivoId: string }) {
  const router = useRouter();
  const [cargando, setCargando] = useState(false);
  const [mensaje, setMensaje] = useState("");

  async function reintentar() {
    setCargando(true);
    setMensaje("");
    try {
      const r = await fetch(`/api/v1/archivos/zoom/archivos/${encodeURIComponent(archivoId)}/reintentar`, { method: "POST" });
      if (!r.ok) {
        setMensaje(mensajeError(r.status));
        return;
      }
      setMensaje("Archivo enviado a la cola.");
      router.refresh();
    } catch {
      setMensaje("No se pudo reintentar el archivo.");
    } finally {
      setCargando(false);
    }
  }

  return (
    <span className="zoom-retry-inline">
      <button type="button" className="secondary-action zoom-retry-btn" disabled={cargando} onClick={reintentar}>
        {cargando ? "Reintentando…" : "Reintentar"}
      </button>
      <span className="zoom-retry-feedback" aria-live="polite">{mensaje}</span>
    </span>
  );
}
