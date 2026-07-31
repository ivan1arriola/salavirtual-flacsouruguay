"use client";

import { CalendarPlus, Save, Trash2, UserRoundMinus, UserRoundPlus } from "lucide-react";
import { useRouter } from "next/navigation";
import { useState } from "react";

type Encounter = Readonly<{
  id: string;
  ordinal: number;
  inicio: string;
  fin: string;
  estado: string;
  requiereAsistencia: boolean;
  asistente: string | null;
  postulantes: number;
  host: string;
  codigoMeet: string | null;
  joinUrl: string | null;
  editable: boolean;
}>;

export function MeetingDetailManager({
  solicitudId,
  meetings
}: Readonly<{ solicitudId: string; meetings: readonly Encounter[] }>) {
  const router = useRouter();
  const [busy, setBusy] = useState<string | null>(null);
  const [message, setMessage] = useState("");

  async function request(id: string, init: RequestInit) {
    setBusy(id);
    setMessage("");
    try {
      const response = await fetch(`/api/v1/reuniones/${solicitudId}/encuentros${id ? `/${id}` : ""}`, {
        ...init,
        headers: { "Content-Type": "application/json" }
      });
      const result = await response.json().catch(() => ({}));
      setMessage(response.ok ? result.message ?? "Cambios guardados." : result.error ?? "No se pudo completar la operación.");
      if (response.ok) router.refresh();
    } catch {
      setMessage("No se pudo conectar con el servidor. Intentá nuevamente.");
    } finally {
      setBusy(null);
    }
  }

  function add(formData: FormData) {
    return request("", {
      method: "POST",
      body: JSON.stringify({
        inicio: localMontevideoToIso(String(formData.get("inicio"))),
        fin: localMontevideoToIso(String(formData.get("fin"))),
        requiereAsistencia: formData.get("requiereAsistencia") === "on",
        requiereGrabacion: formData.get("requiereGrabacion") === "on"
      })
    });
  }

  function edit(id: string, formData: FormData) {
    return request(id, {
      method: "PATCH",
      body: JSON.stringify({
        accion: "EDITAR_FECHA",
        inicio: localMontevideoToIso(String(formData.get("inicio"))),
        fin: localMontevideoToIso(String(formData.get("fin")))
      })
    });
  }

  function changeAssistance(id: string, value: boolean) {
    return request(id, {
      method: "PATCH",
      body: JSON.stringify({ accion: "CAMBIAR_ASISTENCIA", requiereAsistencia: value })
    });
  }

  function remove(id: string) {
    if (!window.confirm("Se cancelará el evento de Calendar y se eliminará este encuentro. ¿Continuar?")) return;
    return request(id, { method: "DELETE" });
  }

  return (
    <>
      <section className="content-section add-encounter-section">
        <div className="section-heading"><div><h2>Agregar encuentro</h2><p>Se asignará una sala Meet disponible.</p></div></div>
        <form className="encounter-add-form" action={add}>
          <label className="field"><span>Inicio</span><input name="inicio" type="datetime-local" required /></label>
          <label className="field"><span>Fin</span><input name="fin" type="datetime-local" required /></label>
          <label className="check-field encounter-add-check"><input name="requiereAsistencia" type="checkbox" /><span>Asistencia</span></label>
          <label className="check-field encounter-add-check"><input name="requiereGrabacion" type="checkbox" /><span>Grabación</span></label>
          <button className="primary-action" disabled={busy !== null} type="submit"><CalendarPlus size={17} />Agregar</button>
        </form>
      </section>

      <div className="encounter-list">
        {meetings.map((meeting) => (
          <article className="encounter-item" key={meeting.id}>
            <header>
              <span><strong>Encuentro {meeting.ordinal}</strong><small>{meeting.host}{meeting.codigoMeet ? ` · ${meeting.codigoMeet}` : ""}</small></span>
              <span className={`status status-${meeting.estado === "PROGRAMADA" ? "ok" : "neutral"}`}>{meeting.estado.toLowerCase()}</span>
            </header>
            <form className="encounter-edit-form" action={(formData) => edit(meeting.id, formData)}>
              <label className="field"><span>Inicio</span><input name="inicio" type="datetime-local" defaultValue={meeting.inicio} disabled={!meeting.editable || busy !== null} required /></label>
              <label className="field"><span>Fin</span><input name="fin" type="datetime-local" defaultValue={meeting.fin} disabled={!meeting.editable || busy !== null} required /></label>
              <button className="secondary-action" disabled={!meeting.editable || busy !== null} type="submit"><Save size={16} />Guardar fecha</button>
            </form>
            <div className="encounter-assistance">
              <span>
                <strong>{meeting.requiereAsistencia ? "Asistencia solicitada" : "Sin asistencia"}</strong>
                <small>{meeting.asistente ? `Asignada a ${meeting.asistente}` : meeting.requiereAsistencia ? `${meeting.postulantes} postulaciones` : ""}</small>
              </span>
              <div className="encounter-actions">
                {meeting.requiereAsistencia ? (
                  <button className="secondary-action" disabled={!meeting.editable || busy !== null} onClick={() => changeAssistance(meeting.id, false)} type="button"><UserRoundMinus size={16} />Cancelar asistencia</button>
                ) : (
                  <button className="secondary-action" disabled={!meeting.editable || busy !== null} onClick={() => changeAssistance(meeting.id, true)} type="button"><UserRoundPlus size={16} />Pedir asistencia</button>
                )}
                {meeting.joinUrl ? <a className="secondary-action" href={meeting.joinUrl} target="_blank" rel="noreferrer">Abrir Meet</a> : null}
                <button className="icon-button danger-action" disabled={!meeting.editable || busy !== null || meetings.length <= 1} onClick={() => remove(meeting.id)} title="Eliminar encuentro" type="button"><Trash2 size={17} /><span className="sr-only">Eliminar encuentro</span></button>
              </div>
            </div>
          </article>
        ))}
      </div>
      <p className="form-message meeting-detail-message" role="status">{message}</p>
    </>
  );
}

function localMontevideoToIso(value: string): string {
  return `${value}:00-03:00`;
}
