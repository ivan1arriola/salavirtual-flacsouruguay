"use client";

import { useCallback, useEffect, useState } from "react";

type Respuesta =
  | {
      estado: "DISPONIBLE";
      participantes: { id: string; nombre: string; email: string | null }[];
      actualizadoAt: string;
    }
  | { estado: "NO_DISPONIBLE"; motivo: string };

export function ParticipantesZoomVivo({ instanciaId }: Readonly<{ instanciaId: string }>) {
  const [resultado, setResultado] = useState<Respuesta | null>(null);
  const [cargando, setCargando] = useState(false);
  const actualizar = useCallback(async () => {
    setCargando(true);
    try {
      const response = await fetch(
        `/api/v1/reuniones/instancias/${encodeURIComponent(instanciaId)}/participantes-zoom`,
        { cache: "no-store" }
      );
      if (!response.ok) {
        throw new Error("No disponible");
      }
      setResultado((await response.json()) as Respuesta);
    } catch {
      setResultado({
        estado: "NO_DISPONIBLE",
        motivo: "No se pudieron consultar los participantes. Probá desde Zoom."
      });
    } finally {
      setCargando(false);
    }
  }, [instanciaId]);

  useEffect(() => {
    const initial = window.setTimeout(() => void actualizar(), 0);
    const interval = window.setInterval(() => {
      if (document.visibilityState === "visible") {
        void actualizar();
      }
    }, 60000);
    return () => {
      window.clearTimeout(initial);
      window.clearInterval(interval);
    };
  }, [actualizar]);

  let lista = null;
  if (resultado?.estado === "DISPONIBLE") {
    lista = resultado.participantes.length ? (
      <ul>
        {resultado.participantes.map((persona) => (
          <li key={persona.id}>
            {persona.nombre}
            {persona.email ? ` · ${persona.email}` : ""}
          </li>
        ))}
      </ul>
    ) : (
      <p role="status">No hay participantes conectados en este momento.</p>
    );
  }

  return (
    <section aria-label="Participantes conectados en Zoom">
      <h3>
        Conectados ahora {resultado?.estado === "DISPONIBLE" ? `(${resultado.participantes.length})` : ""}
      </h3>
      <p>Datos en vivo de Zoom; no equivalen a la asistencia final.</p>
      <button type="button" onClick={() => void actualizar()} disabled={cargando}>
        {cargando ? "Actualizando…" : "Actualizar participantes"}
      </button>
      {resultado?.estado === "NO_DISPONIBLE" ? <p role="status">{resultado.motivo}</p> : null}
      {lista}
    </section>
  );
}
