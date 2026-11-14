"use client";

import { useEffect, useId, useRef } from "react";

export type CancelacionZoom =
  | Readonly<{ tipo: "encuentro"; fecha: string }>
  | Readonly<{ tipo: "serie"; cantidad: number }>;

export function ConfirmacionCancelacionZoom({
  detalle,
  onCerrar,
  onConfirmar
}: Readonly<{ detalle: CancelacionZoom; onCerrar: () => void; onConfirmar: () => void }>) {
  const dialogo = useRef<HTMLDialogElement>(null);
  const volver = useRef<HTMLButtonElement>(null);
  const id = useId();

  useEffect(() => {
    const elemento = dialogo.current;
    if (!elemento) return;
    elemento.showModal();
    volver.current?.focus();
    return () => {
      if (elemento.open) elemento.close();
    };
  }, []);

  const esSerie = detalle.tipo === "serie";
  return (
    <dialog
      ref={dialogo}
      className="zoom-cancel-dialog"
      aria-labelledby={`${id}-titulo`}
      aria-describedby={`${id}-descripcion`}
      onCancel={(event) => {
        event.preventDefault();
        onCerrar();
      }}
    >
      <h2 id={`${id}-titulo`}>{esSerie ? "Cancelar serie" : "Cancelar encuentro"}</h2>
      <p id={`${id}-descripcion`}>
        {detalle.tipo === "serie"
          ? `Se cancelará toda la serie. Tiene ${detalle.cantidad} ${detalle.cantidad === 1 ? "encuentro editable" : "encuentros editables"}; la cancelación también afecta los demás encuentros de la serie.`
          : `Se cancelará el encuentro del ${detalle.fecha}.`}{" "}
        La cancelación se registrará y se intentará aplicar en Zoom.
      </p>
      <div className="zoom-cancel-dialog__actions">
        <button ref={volver} type="button" className="secondary-action" onClick={onCerrar}>
          Volver
        </button>
        <button type="button" className="primary-action" onClick={onConfirmar}>
          {esSerie ? "Cancelar serie" : "Cancelar encuentro"}
        </button>
      </div>
    </dialog>
  );
}
