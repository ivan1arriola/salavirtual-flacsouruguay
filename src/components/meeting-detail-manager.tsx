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
        inicio: localMontevideoToIso(formData, "horaInicio"),
        fin: localMontevideoToIso(formData, "horaFin"),
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
        inicio: localMontevideoToIso(formData, "horaInicio"),
        fin: localMontevideoToIso(formData, "horaFin")
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

  async function removeAll() {
    if (!window.confirm("Se cancelarán todos los eventos de Calendar y se eliminará la reunión completa. Esta acción no se puede deshacer. ¿Continuar?")) return;
    setBusy("all");
    setMessage("");
    try {
      const response = await fetch(`/api/v1/reuniones/${solicitudId}/encuentros`, {
        method: "DELETE"
      });
      const result = await response.json().catch(() => ({}));
      if (!response.ok) {
        setMessage(result.error ?? "No se pudo eliminar la reunión.");
        return;
      }
      router.push("/reuniones");
      router.refresh();
    } catch {
      setMessage("No se pudo conectar con el servidor. Intentá nuevamente.");
    } finally {
      setBusy(null);
    }
  }

  const canRemoveAll = meetings.length > 0 && meetings.every(({ editable }) => editable);

  return (
    <>
      <section className="meeting-danger-zone">
        <div>
          <h2>Eliminar reunión completa</h2>
          <p>Elimina la reunión y todos sus encuentros futuros, incluidos sus eventos de Calendar.</p>
        </div>
        <button
          className="secondary-action danger-action"
          disabled={!canRemoveAll || busy !== null}
          onClick={removeAll}
          type="button"
        >
          <Trash2 size={17} />{busy === "all" ? "Eliminando…" : "Eliminar todo"}
        </button>
      </section>
      <section className="content-section add-encounter-section">
        <div className="section-heading"><div><h2>Agregar encuentro</h2><p>Se asignará una sala Meet disponible.</p></div></div>
        <form className="encounter-add-form" action={add}>
          <label className="field"><span>Fecha</span><input name="fecha" type="date" required /></label>
          <label className="field"><span>Hora de inicio</span><input name="horaInicio" type="time" required /></label>
          <label className="field"><span>Hora de fin</span><input name="horaFin" type="time" required /></label>
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
              <label className="field"><span>Fecha</span><input name="fecha" type="date" defaultValue={meeting.inicio.slice(0, 10)} disabled={!meeting.editable || busy !== null} required /></label>
              <label className="field"><span>Hora de inicio</span><input name="horaInicio" type="time" defaultValue={meeting.inicio.slice(11, 16)} disabled={!meeting.editable || busy !== null} required /></label>
              <label className="field"><span>Hora de fin</span><input name="horaFin" type="time" defaultValue={meeting.fin.slice(11, 16)} disabled={!meeting.editable || busy !== null} required /></label>
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

function localMontevideoToIso(formData: FormData, timeField: string): string {
  return `${String(formData.get("fecha"))}T${String(formData.get(timeField))}:00-03:00`;
}
