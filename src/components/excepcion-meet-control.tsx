"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";

export function ExcepcionMeetControl({
  instanciaId,
  conservar,
  motivoActual,
}: Readonly<{ instanciaId: string; conservar: boolean; motivoActual: string | null }>) {
  const router = useRouter();
  const [motivo, setMotivo] = useState(motivoActual ?? "");
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  function guardar(nuevoValor: boolean) {
    setError(null);
    startTransition(async () => {
      const response = await fetch(`/api/v1/reuniones/instancias/${instanciaId}/excepcion-meet`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ conservar: nuevoValor, motivo: nuevoValor ? motivo : null }),
      });
      if (!response.ok) {
        const body = await response.json().catch(() => null) as { error?: string } | null;
        setError(body?.error ?? "No se pudo guardar la excepción.");
        return;
      }
      router.refresh();
    });
  }

  return (
    <div>
      <label>
        <input
          type="checkbox"
          checked={conservar}
          disabled={pending}
          onChange={(event) => (event.target.checked ? undefined : guardar(false))}
          aria-label="Conservar en Google Meet"
        />{" "}
        Conservar en Google Meet
      </label>
      <input
        type="text"
        value={motivo}
        maxLength={500}
        placeholder="Motivo"
        disabled={pending}
        onChange={(event) => setMotivo(event.target.value)}
        aria-label="Motivo para conservar en Google Meet"
      />
      <button type="button" disabled={pending || motivo.trim().length < 3} onClick={() => guardar(true)}>
        {conservar ? "Actualizar motivo" : "Conservar en Meet"}
      </button>
      {error ? <p role="alert">{error}</p> : null}
    </div>
  );
}
