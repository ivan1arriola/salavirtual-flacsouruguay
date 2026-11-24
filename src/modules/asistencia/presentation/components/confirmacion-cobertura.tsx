"use client";

import { useEffect, useId, useRef } from "react";

export type ConfirmacionCoberturaDetalle =
  | Readonly<{ tipo: "convocatoria" }>
  | Readonly<{ tipo: "desasignacion"; nombre: string; asignacionId: string }>
  | Readonly<{ tipo: "reasignacion"; anterior: string; nombre: string; asistenteId: string }>
  | Readonly<{ tipo: "cancelar" }>
  | Readonly<{
      tipo: "aprobacion";
      nombre: string;
      minutos: number;
      moneda: string;
      importe: string;
      registroId: string;
    }>;

function textoConfirmacion(detalle: ConfirmacionCoberturaDetalle) {
  switch (detalle.tipo) {
    case "convocatoria":
      return {
        titulo: "Abrir convocatoria",
        descripcion: "La reunión aparecerá en Agenda abierta y se notificará a los asistentes disponibles."
      };
    case "desasignacion":
      return {
        titulo: "Desasignar asistente",
        descripcion: `Se quitará a ${detalle.nombre} del monitoreo. El encuentro seguirá requiriendo cobertura y quedará pendiente. Solo se notificará a la persona afectada.`
      };
    case "reasignacion":
      return {
        titulo: "Confirmar reasignación",
        descripcion: `Se sustituirá a ${detalle.anterior} por ${detalle.nombre}. Se notificará a ambas personas, sin convocatoria general.`
      };
    case "cancelar":
      return {
        titulo: "Quitar requisito de monitoreo",
        descripcion: "El encuentro seguirá programado, pero dejará de requerir monitoreo y se retirarán las postulaciones activas."
      };
    case "aprobacion":
      return {
        titulo: "Aprobar registro",
        descripcion: `Se aprobará el registro de ${detalle.nombre}: ${detalle.minutos} minutos, ${detalle.moneda} ${detalle.importe}. Las horas y el importe se incluirán en las liquidaciones del período.`
      };
  }
}

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
    if (!elemento) {
      return;
    }
    elemento.showModal();
    volver.current?.focus();
    return () => {
      if (elemento.open) {
        elemento.close();
      }
    };
  }, []);

  const texto = textoConfirmacion(detalle);
  const destructive = detalle.tipo === "desasignacion" || detalle.tipo === "cancelar";
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
      <h2 id={`${id}-titulo`}>{texto.titulo}</h2>
      <p id={`${id}-descripcion`}>{texto.descripcion}</p>
      <div className="monitoring-confirm-dialog__actions">
        <button ref={volver} type="button" className="secondary-action" onClick={onCerrar}>
          Volver
        </button>
        <button type="button" className={destructive ? "monitoring-danger-action" : "primary-action"} onClick={onConfirmar}>
          {texto.titulo}
        </button>
      </div>
    </dialog>
  );
}
