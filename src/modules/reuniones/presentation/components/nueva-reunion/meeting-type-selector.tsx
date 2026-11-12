import { useEffect, useRef } from "react";
import type { MeetingDateMode } from "./tipos";
import styles from "./nueva-reunion.module.css";

export function MeetingTypeSelector({
  dateMode,
  onModeChange,
  pendingMode,
  onConfirm,
  onCancel
}: Readonly<{
  dateMode: MeetingDateMode;
  onModeChange: (mode: MeetingDateMode) => void;
  pendingMode: MeetingDateMode | null;
  onConfirm: () => void;
  onCancel: () => void;
}>) {
  const selectorRef = useRef<HTMLFieldSetElement>(null);
  const avisoRef = useRef<HTMLDivElement>(null);
  const estabaPendiente = useRef(false);
  useEffect(() => {
    if (pendingMode) {
      avisoRef.current?.focus();
    } else if (estabaPendiente.current) {
      selectorRef.current?.querySelector<HTMLInputElement>("input:checked")?.focus();
    }
    estabaPendiente.current = Boolean(pendingMode);
  }, [pendingMode]);

  return (
    <div className={styles.typeSection}>
      <fieldset className={styles.typeSelector} ref={selectorRef}>
        <legend>Tipo de reunión</legend>
        <label>
          <input
            type="radio"
            name="meetingType"
            value="SINGLE"
            checked={dateMode === "SINGLE"}
            onChange={() => onModeChange("SINGLE")}
          />
          <span>
            <strong>Reunión única</strong>
            <small>Una fecha con su horario y detalle opcional.</small>
          </span>
        </label>
        <label>
          <input
            type="radio"
            name="meetingType"
            value="SERIES"
            checked={dateMode !== "SINGLE"}
            onChange={() => {
              if (dateMode === "SINGLE") {
                onModeChange("RECURRENT");
              }
            }}
          />
          <span>
            <strong>Serie de encuentros</strong>
            <small>Repetición semanal o fechas específicas.</small>
          </span>
        </label>
      </fieldset>
      {pendingMode ? (
        <div
          className={styles.changeNotice}
          role="group"
          aria-labelledby="cambio-tipo-titulo"
          aria-describedby="cambio-tipo-detalle"
          tabIndex={-1}
          ref={avisoRef}
        >
          <strong id="cambio-tipo-titulo">Confirmá el cambio de fechas</strong>
          <p id="cambio-tipo-detalle">
            {pendingMode === "SINGLE"
              ? "Se conservará solo el primer encuentro cronológico. Las demás fechas se quitarán al confirmar."
              : pendingMode === "RECURRENT"
                ? "Las fechas cargadas se quitarán al confirmar. Definí la regla semanal y generá una nueva vista previa."
                : "Se conservarán las fechas cargadas para editarlas por separado. La regla semanal dejará de aplicarse."}
          </p>
          <div>
            <button type="button" onClick={onConfirm}>
              Confirmar cambio
            </button>
            <button type="button" onClick={onCancel}>
              Conservar y seguir editando
            </button>
          </div>
        </div>
      ) : null}
    </div>
  );
}
