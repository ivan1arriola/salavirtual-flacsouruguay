"use client";

import { ArrowRight, CalendarPlus, CheckCircle2, LoaderCircle } from "lucide-react";
import { type KeyboardEvent, useEffect, useRef } from "react";

export function MeetingCreationDialog({
  state,
  message,
  meetingId,
  meetingCount,
}: Readonly<{
  state: "saving" | "done";
  message: string;
  meetingId?: string;
  meetingCount: number;
}>) {
  const saving = state === "saving";
  const dialogoRef = useRef<HTMLElement>(null);
  const principalRef = useRef<HTMLAnchorElement>(null);

  // Al abrirse el foco pasa al diálogo; al terminar, al enlace principal (quien usa teclado
  // no queda con el foco detrás del diálogo).
  useEffect(() => {
    if (saving || !meetingId) {
      dialogoRef.current?.focus();
    } else {
      principalRef.current?.focus();
    }
  }, [saving, meetingId]);

  // Diálogo modal: Tab no sale de él. Mientras guarda no hay controles, así que el foco se queda
  // en el diálogo; al terminar, Tab alterna entre sus dos enlaces. No se cierra con Escape.
  function manejarTeclado(event: KeyboardEvent<HTMLElement>) {
    if (event.key !== "Tab") {
      return;
    }
    const enlaces = Array.from(event.currentTarget.querySelectorAll<HTMLElement>("a[href]"));
    if (enlaces.length === 0) {
      event.preventDefault();
      return;
    }
    const primero = enlaces[0];
    const ultimo = enlaces[enlaces.length - 1];
    if (event.shiftKey && document.activeElement === primero) {
      event.preventDefault();
      ultimo.focus();
    } else if (!event.shiftKey && document.activeElement === ultimo) {
      event.preventDefault();
      primero.focus();
    }
  }

  return (
    <div className="meeting-creation-backdrop">
      <section
        className="meeting-creation-dialog"
        role="dialog"
        aria-modal="true"
        aria-labelledby="meeting-creation-title"
        aria-live="polite"
        onKeyDown={manejarTeclado}
        ref={dialogoRef}
        tabIndex={-1}
      >
        <div className={`meeting-creation-icon${saving ? " is-loading" : " is-done"}`}>
          {saving ? <LoaderCircle size={30} /> : <CheckCircle2 size={30} />}
        </div>
        <div>
          <h2 id="meeting-creation-title">{saving ? "Creando reunión" : "Reunión creada"}</h2>
          <p>
            {saving
              ? `Guardando ${meetingCount} ${meetingCount === 1 ? "encuentro" : "encuentros"} y configurando Zoom.`
              : message}
          </p>
        </div>
        {saving ? (
          <div className="meeting-creation-progress" aria-hidden="true">
            <span />
          </div>
        ) : null}
        {!saving && meetingId ? (
          <div className="meeting-creation-actions">
            {/* eslint-disable-next-line @next/next/no-html-link-for-pages -- Recargar la misma ruta reinicia el formulario. */}
            <a className="secondary-action" href="/reuniones/nueva">
              <CalendarPlus size={17} />
              Crear otra
            </a>
            <a className="primary-action" href={`/reuniones/${meetingId}`} ref={principalRef}>
              Ver reunión
              <ArrowRight size={17} />
            </a>
          </div>
        ) : null}
      </section>
    </div>
  );
}
