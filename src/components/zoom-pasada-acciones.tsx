"use client";
import { useState } from "react";
import { useRouter } from "next/navigation";
import {
  desvincularOcurrenciaZoomCliente,
  reintentarAsistenciaZoomCliente,
  type ResultadoAccionZoom,
} from "@/src/lib/zoom-pasadas-cliente";

export function ZoomPasadaAcciones({
  ocurrenciaId,
  eventoId,
  instanciaId,
}: {
  ocurrenciaId: string;
  eventoId: string;
  instanciaId: string;
}) {
  const router = useRouter();
  const [cargando, setCargando] = useState(false);
  const [mensaje, setMensaje] = useState("");

  async function ejecutar(pregunta: string, accion: () => Promise<ResultadoAccionZoom>) {
    if (!window.confirm(pregunta)) {
      return;
    }
    setCargando(true);
    setMensaje("");
    const r = await accion();
    setMensaje(r.mensaje);
    setCargando(false);
    if (r.ok) {
      router.refresh();
    }
  }

  return (
    <div>
      <button
        type="button"
        className="secondary-action"
        disabled={cargando}
        onClick={() =>
          ejecutar("¿Volver a calcular la asistencia de este encuentro desde Zoom?", () =>
            reintentarAsistenciaZoomCliente(instanciaId),
          )
        }
      >
        Reintentar asistencia
      </button>{" "}
      <button
        type="button"
        className="secondary-action"
        disabled={cargando}
        onClick={() =>
          ejecutar(
            "¿Desvincular esta ejecución del encuentro? Se quitan sus referencias locales; los archivos de Drive no se borran.",
            () => desvincularOcurrenciaZoomCliente(ocurrenciaId, eventoId),
          )
        }
      >
        Desvincular
      </button>
      <p role="status" aria-live="polite">
        {cargando ? "Procesando…" : mensaje}
      </p>
    </div>
  );
}
