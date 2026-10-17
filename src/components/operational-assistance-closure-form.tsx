"use client";

import { CheckCircle2, Clock3, LoaderCircle } from "lucide-react";
import { useRouter } from "next/navigation";
import { FormEvent, useState } from "react";

export function OperationalAssistanceClosureForm({
  asignacionId,
  inicioProgramado,
  finProgramado,
  cierreConfirmado
}: Readonly<{
  asignacionId: string;
  inicioProgramado: string;
  finProgramado: string;
  cierreConfirmado: boolean;
}>) {
  const router = useRouter();
  const [inicio, setInicio] = useState(() => toMontevideoInput(new Date(inicioProgramado)));
  const [fin, setFin] = useState(() => toMontevideoInput(new Date(finProgramado)));
  const [comentario, setComentario] = useState("");
  const [pending, setPending] = useState(false);
  const [message, setMessage] = useState("");

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setPending(true);
    setMessage("");
    try {
      const response = await fetch("/api/v1/asistencia/duracion", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          asignacionId,
          inicioReal: montevideoInputToIso(inicio),
          finReal: montevideoInputToIso(fin),
          comentario: comentario || undefined
        })
      });
      const result = await response.json().catch(() => ({}));
      if (!response.ok) {
        setMessage(result.error ?? "No se pudo guardar el cierre.");
        return;
      }
      setMessage("Cierre guardado.");
      router.refresh();
    } catch {
      setMessage("No se pudo conectar con el servidor.");
    } finally {
      setPending(false);
    }
  }

  return (
    <details className="content-section">
      <summary>
        <CheckCircle2 size={17} aria-hidden="true" />
        <strong>{cierreConfirmado ? "Ajustar cierre de monitoreo" : "Finalizar monitoreo"}</strong>
      </summary>
      <form className="encounter-edit-form" onSubmit={submit}>
        <label className="field">
          <span>Inicio efectivo</span>
          <input
            type="datetime-local"
            value={inicio}
            onChange={(event) => setInicio(event.target.value)}
            required
            disabled={pending}
          />
        </label>
        <label className="field">
          <span>Fin efectivo</span>
          <input
            type="datetime-local"
            value={fin}
            onChange={(event) => setFin(event.target.value)}
            required
            disabled={pending}
          />
        </label>
        <label className="field encounter-description-field">
          <span>Observación</span>
          <textarea
            rows={3}
            maxLength={1000}
            value={comentario}
            onChange={(event) => setComentario(event.target.value)}
            disabled={pending}
            placeholder="Opcional: extensión, espera, dificultades o contexto del cierre."
          />
        </label>
        <button className="primary-action" type="submit" disabled={pending}>
          {pending ? <LoaderCircle className="button-spinner" size={16} /> : <Clock3 size={16} />}
          {pending ? "Guardando…" : cierreConfirmado ? "Guardar ajuste" : "Finalizar monitoreo"}
        </button>
        {message ? <p aria-live="polite">{message}</p> : null}
      </form>
    </details>
  );
}

function toMontevideoInput(date: Date): string {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: "America/Montevideo",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    hourCycle: "h23"
  }).formatToParts(date);
  const value = (type: Intl.DateTimeFormatPartTypes) =>
    parts.find((part) => part.type === type)?.value ?? "";
  return `${value("year")}-${value("month")}-${value("day")}T${value("hour")}:${value("minute")}`;
}

function montevideoInputToIso(value: string): string {
  return new Date(`${value}:00-03:00`).toISOString();
}
