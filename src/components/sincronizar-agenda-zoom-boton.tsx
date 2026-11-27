"use client";

import { RefreshCw } from "lucide-react";
import { useRouter } from "next/navigation";
import { useState } from "react";

type Resultado = Readonly<{
  sinIdentidad: number;
  resultados: ReadonlyArray<
    Readonly<{ cuenta: string; ok: boolean; reuniones: number; eliminadas: number }>
  >;
}>;

/** Pull manual de la agenda de Zoom: reconcilia lo que los webhooks fueron registrando. */
export function SincronizarAgendaZoomBoton() {
  const router = useRouter();
  const [ocupado, setOcupado] = useState(false);
  const [error, setError] = useState("");
  const [resultado, setResultado] = useState<Resultado | null>(null);

  async function sincronizar() {
    if (ocupado) {
      return;
    }
    setOcupado(true);
    setError("");
    setResultado(null);
    try {
      const respuesta = await fetch("/api/v1/configuracion/zoom/agenda/sincronizar", {
        method: "POST",
        cache: "no-store",
      });
      const datos = await respuesta.json().catch(() => ({}));
      if (!respuesta.ok) {
        throw new Error(datos.error ?? "No se pudo sincronizar con Zoom.");
      }
      setResultado(datos as Resultado);
      router.refresh();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Error de conexión.");
    } finally {
      setOcupado(false);
    }
  }

  const fallidas = resultado?.resultados.filter(({ ok }) => !ok) ?? [];
  return (
    <div>
      <button
        className="primary-action"
        type="button"
        onClick={sincronizar}
        disabled={ocupado}
        aria-busy={ocupado}
      >
        <RefreshCw size={16} aria-hidden="true" />{" "}
        {ocupado ? "Sincronizando…" : "Sincronizar con Zoom"}
      </button>
      {error ? <p role="alert">{error}</p> : null}
      {resultado ? (
        <p role="status">
          {resultado.resultados.length - fallidas.length} cuentas sincronizadas
          {fallidas.length
            ? ` · sin poder consultar: ${fallidas.map(({ cuenta }) => cuenta).join(", ")}`
            : ""}
          {resultado.sinIdentidad ? ` · ${resultado.sinIdentidad} sin identidad de Zoom` : ""}.
        </p>
      ) : null}
    </div>
  );
}
