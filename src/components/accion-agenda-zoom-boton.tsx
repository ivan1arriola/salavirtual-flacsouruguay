"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";

type Accion =
  | "CORREGIR_EN_ZOOM"
  | "ADOPTAR_DE_ZOOM"
  | "RECREAR_EN_ZOOM"
  | "CANCELAR_ENCUENTRO"
  | "IGNORAR"
  | "DEJAR_DE_IGNORAR";

/** Acción manual sobre una diferencia de la agenda de Zoom: pide confirmación explícita y refresca la página. */
export function AccionAgendaZoomBoton({
  accion,
  instanciaId,
  observadaId,
  etiqueta,
  confirmacion
}: Readonly<{
  accion: Accion;
  instanciaId?: string;
  observadaId?: string;
  etiqueta: string;
  confirmacion: string;
}>) {
  const router = useRouter();
  const [ocupado, setOcupado] = useState(false);
  const [mensaje, setMensaje] = useState<{ texto: string; error: boolean } | null>(null);

  async function ejecutar() {
    if (ocupado || !window.confirm(confirmacion)) {
      return;
    }
    setOcupado(true);
    setMensaje(null);
    try {
      const respuesta = await fetch("/api/v1/configuracion/zoom/agenda/acciones", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        cache: "no-store",
        body: JSON.stringify({ accion, instanciaId, observadaId })
      });
      const datos = await respuesta.json().catch(() => ({}));
      if (!respuesta.ok && respuesta.status !== 202) {
        throw new Error(datos.error ?? "No se pudo completar la acción.");
      }
      setMensaje({ texto: datos.message ?? "Listo.", error: false });
      router.refresh();
    } catch (e) {
      setMensaje({ texto: e instanceof Error ? e.message : "Error de conexión.", error: true });
    } finally {
      setOcupado(false);
    }
  }

  return (
    <span>
      <button
        className="secondary-action"
        type="button"
        onClick={ejecutar}
        disabled={ocupado}
        aria-busy={ocupado}
      >
        {ocupado ? "Procesando…" : etiqueta}
      </button>
      {mensaje ? <small role={mensaje.error ? "alert" : "status"}> {mensaje.texto}</small> : null}
    </span>
  );
}
