"use client";

import { useEffect, useId, useRef } from "react";

export type ConfirmacionCoberturaDetalle =
  | Readonly<{ tipo: "convocatoria" }>
  | Readonly<{
      tipo: "aprobacion";
      nombre: string;
      minutos: number;
      moneda: string;
      importe: string;
      registroId: string;
    }>;

export function ConfirmacionCobertura({
  detalle,
  onCerrar,
  onConfirmar
}: Readonly<{
  detalle: ConfirmacionCoberturaDetalle;
  onCerrar: () => void;
  onConfirmar: () => void;
}>) {
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

  const convocatoria = detalle.tipo === "convocatoria";
  return (
    <dialog
      ref={dialogo}
      className="monitoring-confirm-dialog"
      aria-labelledby={`${id}-titulo`}
      aria-describedby={`${id}-descripcion`}
      onCancel={(event) => {
        event.preventDefault();
        onCerrar();
      }}
    >
      <h2 id={`${id}-titulo`}>{convocatoria ? "Abrir convocatoria" : "Aprobar registro"}</h2>
      <p id={`${id}-descripcion`}>
        {detalle.tipo === "convocatoria"
          ? "La reunión aparecerá en Agenda abierta y se notificará a los asistentes disponibles."
          : `Se aprobará el registro de ${detalle.nombre}: ${detalle.minutos} minutos, ${detalle.moneda} ${detalle.importe}. Las horas y el importe se incluirán en las liquidaciones del período.`}
      </p>
      <div className="monitoring-confirm-dialog__actions">
        <button ref={volver} type="button" className="secondary-action" onClick={onCerrar}>
          Volver
        </button>
        <button type="button" className="primary-action" onClick={onConfirmar}>
          {convocatoria ? "Abrir convocatoria" : "Aprobar registro"}
        </button>
      </div>
    </dialog>
  );
}
