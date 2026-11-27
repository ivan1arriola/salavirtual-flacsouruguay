"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import styles from "./excepcion-meet-control.module.css";

export function ExcepcionMeetControl({
  instanciaId,
  conservar,
  motivoActual,
}: Readonly<{ instanciaId: string; conservar: boolean; motivoActual: string | null }>) {
  const router = useRouter();
  const [abierto, setAbierto] = useState(false);
  const [motivo, setMotivo] = useState(motivoActual ?? "");
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  function guardar(nuevoValor: boolean) {
    setError(null);
    startTransition(async () => {
      try {
        const response = await fetch(`/api/v1/reuniones/instancias/${instanciaId}/excepcion-meet`, {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            conservar: nuevoValor,
            motivo: nuevoValor ? motivo.trim() : null,
          }),
        });
        if (!response.ok) {
          const body = (await response.json().catch(() => null)) as { error?: string } | null;
          throw new Error(body?.error ?? "No se pudo guardar la excepción.");
        }
        setAbierto(false);
        router.refresh();
      } catch (cause) {
        setError(cause instanceof Error ? cause.message : "No se pudo guardar la excepción.");
      }
    });
  }

  return (
    <div className={styles["control"]}>
      {conservar ? (
        <div className={styles["saved"]}>
          <span>
            <strong>Excepción Meet</strong> · {motivoActual}
          </span>
          <div className={styles["actions"]}>
            <button type="button" disabled={pending} onClick={() => setAbierto((valor) => !valor)}>
              Editar motivo
            </button>
            <button type="button" disabled={pending} onClick={() => guardar(false)}>
              Quitar excepción
            </button>
          </div>
        </div>
      ) : (
        <button
          type="button"
          className={styles["openButton"]}
          disabled={pending}
          onClick={() => setAbierto((valor) => !valor)}
        >
          {abierto ? "Cancelar excepción" : "Conservar este encuentro en Meet"}
        </button>
      )}
      {abierto && (
        <div className={styles["form"]}>
          <label htmlFor={`motivo-meet-${instanciaId}`}>Motivo de la excepción</label>
          <div>
            <input
              id={`motivo-meet-${instanciaId}`}
              type="text"
              value={motivo}
              maxLength={500}
              placeholder="Por qué debe seguir en Meet"
              disabled={pending}
              onChange={(event) => setMotivo(event.target.value)}
            />
            <button
              type="button"
              disabled={pending || motivo.trim().length < 3}
              onClick={() => guardar(true)}
            >
              {pending ? "Guardando…" : "Guardar excepción"}
            </button>
          </div>
        </div>
      )}
      {error && (
        <p className={styles["error"]} role="alert">
          {error}
        </p>
      )}
    </div>
  );
}
