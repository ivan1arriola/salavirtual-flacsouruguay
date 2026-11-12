"use client";

import { Wrench } from "lucide-react";
import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";

type Resultado = Readonly<{ resultado: string; mensaje?: string }>;

/** Unifica la cuenta anfitriona y el enlace de una serie de Zoom que hoy los tiene distintos. */
export function CorregirSerieZoomBoton({
  serieClave,
  titulo
}: Readonly<{ serieClave: string; titulo: string }>) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [mensaje, setMensaje] = useState("");

  function corregir() {
    if (
      !window.confirm(
        `Se creará una sola reunión de Zoom para “${titulo}” y todos sus encuentros pasarán al mismo enlace. ` +
          "Quienes ya tenían un enlace recibirán el nuevo; el anterior seguirá activo 7 días. ¿Continuar?"
      )
    ) {
      return;
    }
    setMensaje("");
    startTransition(async () => {
      const response = await fetch("/api/v1/reuniones/migracion-zoom/series-enlaces", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ modo: "PILOTO", serieClaves: [serieClave] })
      });
      const cuerpo = await response.json().catch(() => ({}));
      const resultado = (cuerpo.resultados as readonly Resultado[] | undefined)?.[0];
      if (
        !response.ok ||
        !resultado ||
        resultado.resultado === "ERROR" ||
        resultado.resultado === "OMITIDA"
      ) {
        setMensaje(resultado?.mensaje ?? cuerpo.error ?? "No se pudo corregir la serie.");
        return;
      }
      router.refresh();
    });
  }

  return (
    <span aria-busy={pending || undefined}>
      <button
        aria-label={`Corregir el enlace de la serie ${titulo}`}
        className="secondary-action"
        disabled={pending}
        onClick={corregir}
        type="button"
      >
        <Wrench size={16} aria-hidden="true" /> {pending ? "Corrigiendo…" : "Corregir"}
      </button>
      {mensaje ? <span role="alert"> {mensaje}</span> : null}
    </span>
  );
}
