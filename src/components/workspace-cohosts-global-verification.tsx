"use client";

import { CheckCircle2, CircleAlert, LoaderCircle, SearchCheck, ShieldQuestion, X } from "lucide-react";
import { useRef, useState } from "react";

type Estado = "CONFIRMADA" | "INCOMPLETA" | "NO_VERIFICABLE" | "SIN_COHOSTS";
type Resultado = Readonly<{
  instanciaSalaId: string;
  titulo: string;
  inicio: string;
  codigoReunion: string | null;
  organizador: string | null;
  estado: Estado;
  total: number;
  confirmados: number;
  faltantes: readonly string[];
  origen: "PRINCIPAL" | "LEGACY" | null;
  intentosLegacy: number;
  error: string | null;
}>;
type Pagina = Readonly<{
  resultados: readonly Resultado[];
  siguienteCursor: string | null;
}>;

function fechaUruguay(date: string): string {
  return new Date(date).toLocaleString("es-UY", { timeZone: "America/Montevideo" });
}

export function WorkspaceCohostsGlobalVerification() {
  const [busy, setBusy] = useState(false);
  const [done, setDone] = useState(false);
  const [cancelled, setCancelled] = useState(false);
  const [error, setError] = useState("");
  const [results, setResults] = useState<readonly Resultado[]>([]);
  const controller = useRef<AbortController | null>(null);

  async function verifyAll() {
    setBusy(true);
    setDone(false);
    setCancelled(false);
    setError("");
    setResults([]);
    const abort = new AbortController();
    controller.current = abort;
    try {
      let cursor: string | null = null;
      const visited = new Set<string>();
      do {
        const uri: string = "/api/v1/configuracion/google-workspace/verificar-cohosts"
          + (cursor ? `?cursor=${encodeURIComponent(cursor)}` : "");
        const response = await fetch(uri, { method: "GET", cache: "no-store", signal: abort.signal });
        const payload = await response.json().catch(() => ({}));
        if (!response.ok) throw new Error(payload.error ?? "Falló la consulta a Google Meet.");
        const page = payload as Pagina;
        if (!Array.isArray(page.resultados)) throw new Error("El servidor devolvió un resultado inválido.");
        setResults((current) => [...current, ...page.resultados]);
        const next: string | null = page.siguienteCursor ?? null;
        if (next && visited.has(next)) throw new Error("Google Workspace devolvió una paginación repetida.");
        if (next) visited.add(next);
        cursor = next;
      } while (cursor && !abort.signal.aborted);
      if (!abort.signal.aborted) setDone(true);
    } catch (caught) {
      if (abort.signal.aborted) {
        setCancelled(true);
      } else {
        setError(caught instanceof Error ? caught.message : "No se pudo terminar la verificación.");
      }
    } finally {
      controller.current = null;
      setBusy(false);
    }
  }

  const confirmadas = results.filter((row) => row.estado === "CONFIRMADA").length;
  const incompletas = results.filter((row) => row.estado === "INCOMPLETA").length;
  const desconocidas = results.filter((row) => row.estado === "NO_VERIFICABLE").length;
  const sinCohosts = results.filter((row) => row.estado === "SIN_COHOSTS").length;
  const conLegacy = results.filter((row) => row.origen === "LEGACY").length;
  const issues = results.filter((row) => row.estado !== "CONFIRMADA");

  return (
    <section className="form-section workspace-config workspace-resync-section" aria-labelledby="global-cohost-verification-title">
      <header className="form-section-title">
        <SearchCheck size={22} aria-hidden="true" />
        <div>
          <h2 id="global-cohost-verification-title">Verificación global de cohosts</h2>
          <p>Comprobá de una sola vez todas las reuniones activas y futuras, incluidas las de otros proyectos Google.</p>
        </div>
      </header>
      <div className="workspace-resync-action">
        <div className="workspace-resync-icon"><SearchCheck size={20} aria-hidden="true" /></div>
        <div>
          <strong>Verificar todas las reuniones</strong>
          <span>Consulta los roles COHOST reales y prueba las credenciales Legacy si la Principal no tiene permiso.</span>
          <small>Es una operación de solo lectura: no modifica reuniones, integrantes, permisos ni calendarios.</small>
        </div>
        <button className="secondary-action" onClick={verifyAll} disabled={busy} type="button">
          {busy ? <LoaderCircle className="button-spinner" size={17} /> : <SearchCheck size={17} />}
          {busy ? "Verificando…" : "Verificar todas"}
        </button>
        {busy ? <button className="secondary-action" type="button" onClick={() => controller.current?.abort()}><X size={16} /> Detener</button> : null}
      </div>

      {(busy || done || cancelled || error || results.length > 0) ? (
        <div className={`workspace-resync-feedback${error ? " is-error" : incompletas || desconocidas || sinCohosts ? " is-warning" : " is-success"}`} role="status" aria-live="polite">
          {error || incompletas || desconocidas || sinCohosts ? <CircleAlert size={18} /> : done ? <CheckCircle2 size={18} /> : <ShieldQuestion size={18} />}
          <div>
            <strong>
              {busy ? `Verificando… ${results.length} reuniones consultadas`
                : done ? `Verificación terminada: ${results.length} reuniones`
                : cancelled ? `Verificación detenida tras ${results.length} reuniones`
                : error ? `Verificación incompleta: ${results.length} reuniones consultadas`
                : "Verificación pendiente"}
            </strong>
            <span>
              {confirmadas} confirmadas · {incompletas} incompletas · {desconocidas} no verificables · {sinCohosts} sin cohosts · {conLegacy} leídas con Legacy
            </span>
            {error ? <small role="alert">{error}</small> : null}
            {issues.length > 0 ? (
              <details>
                <summary>Ver {issues.length} reuniones que requieren atención</summary>
                <ul>
                  {issues.map((item) => (
                    <li key={item.instanciaSalaId}>
                      <strong>{item.titulo}</strong>
                      <small>
                        {fechaUruguay(item.inicio)} · {item.codigoReunion ?? "Sin código Meet"} ·
                        {item.estado === "INCOMPLETA" ? ` ${item.confirmados}/${item.total} confirmados`
                          : item.estado === "SIN_COHOSTS" ? " Sin cohosts registrados" : " No verificable"}
                        {item.origen ? ` · ${item.origen === "LEGACY" ? "Credencial Legacy" : "Credencial Principal"}` : ""}
                      </small>
                      {item.faltantes.length > 0 ? <small>Faltan: {item.faltantes.join(", ")}</small> : null}
                      {item.error ? <small>{item.error}{item.intentosLegacy ? ` · ${item.intentosLegacy} Legacy intentadas` : ""}</small> : null}
                    </li>
                  ))}
                </ul>
              </details>
            ) : null}
            {done && results.length === 0 ? <small>No hay reuniones activas o futuras para consultar.</small> : null}
          </div>
        </div>
      ) : null}
    </section>
  );
}
