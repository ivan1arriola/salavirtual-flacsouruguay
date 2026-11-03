"use client";

import { ArrowRight, CalendarPlus, CheckCircle2, LoaderCircle } from "lucide-react";

export function MeetingCreationDialog({
  state,
  message,
  meetingId,
  meetingCount
}: Readonly<{
  state: "saving" | "done";
  message: string;
  meetingId?: string;
  meetingCount: number;
}>) {
  const saving = state === "saving";

  return (
    <div className="meeting-creation-backdrop">
      <section
        className="meeting-creation-dialog"
        role="dialog"
        aria-modal="true"
        aria-labelledby="meeting-creation-title"
        aria-live="polite"
      >
        <div className={`meeting-creation-icon${saving ? " is-loading" : " is-done"}`}>
          {saving ? <LoaderCircle size={30} /> : <CheckCircle2 size={30} />}
        </div>
        <div>
          <h2 id="meeting-creation-title">
            {saving ? "Creando reunión" : "Reunión creada"}
          </h2>
          <p>
            {saving
              ? `Guardando ${meetingCount} ${meetingCount === 1 ? "encuentro" : "encuentros"} y configurando Zoom.`
              : message}
          </p>
        </div>
        {saving ? <div className="meeting-creation-progress" aria-hidden="true"><span /></div> : null}
        {!saving && meetingId ? (
          <div className="meeting-creation-actions">
            <a className="secondary-action" href="/reuniones/nueva">
              <CalendarPlus size={17} />Crear otra
            </a>
            <a className="primary-action" href={`/reuniones/${meetingId}`}>
              Ver reunión<ArrowRight size={17} />
            </a>
          </div>
        ) : null}
      </section>
    </div>
  );
}
