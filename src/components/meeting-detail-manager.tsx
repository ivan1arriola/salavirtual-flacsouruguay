"use client";

import { CalendarPlus, Save, Trash2, UserRoundMinus, UserRoundPlus } from "lucide-react";
import { useRouter } from "next/navigation";
import { useState } from "react";

type Encounter = Readonly<{
  id: string;
  solicitudId: string;
  encuentrosEnSolicitud: number;
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
  temporalidad: "PASADO" | "EN_CURSO" | "FUTURO";
}>;

export function MeetingDetailManager({
  solicitudId,
  requestIds,
  meetings
}: Readonly<{ solicitudId: string; requestIds: readonly string[]; meetings: readonly Encounter[] }>) {
  const router = useRouter();
  const [busy, setBusy] = useState<string | null>(null);
  const [message, setMessage] = useState("");

  async function request(requestId: string, id: string, init: RequestInit) {
    setBusy(id);
    setMessage("");
    try {
      const response = await fetch(`/api/v1/reuniones/${requestId}/encuentros${id ? `/${id}` : ""}`, {
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
    return request(solicitudId, "", {
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
    return request(meetings.find((meeting) => meeting.id === id)?.solicitudId ?? solicitudId, id, {
      method: "PATCH",
      body: JSON.stringify({
        accion: "EDITAR_FECHA",
        inicio: localMontevideoToIso(formData, "horaInicio"),
        fin: localMontevideoToIso(formData, "horaFin")
      })
    });
  }

  function changeAssistance(id: string, value: boolean) {
    return request(meetings.find((meeting) => meeting.id === id)?.solicitudId ?? solicitudId, id, {
      method: "PATCH",
      body: JSON.stringify({ accion: "CAMBIAR_ASISTENCIA", requiereAsistencia: value })
    });
  }

  function remove(id: string) {
    if (!window.confirm("Se cancelará el evento de Calendar y se eliminará este encuentro. ¿Continuar?")) return;
    return request(meetings.find((meeting) => meeting.id === id)?.solicitudId ?? solicitudId, id, { method: "DELETE" });
  }

  async function removeAll() {
    if (!window.confirm("Se cancelarán todos los eventos de Calendar y se eliminará la reunión completa. Esta acción no se puede deshacer. ¿Continuar?")) return;
    setBusy("all");
    setMessage("");
    try {
      const responses = await Promise.all(requestIds.map((requestId) =>
        fetch(`/api/v1/reuniones/${requestId}/encuentros`, { method: "DELETE" })
      ));
      const failed = responses.find((response) => !response.ok);
      if (failed) {
        const result = await failed.json().catch(() => ({}));
        setMessage(result.error ?? "No se pudo eliminar la reunión completa.");
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
  const removeAllBlockedReason = meetings.length === 0
    ? "La reunión no tiene encuentros para eliminar."
    : !canRemoveAll
      ? "Solo se puede eliminar completa cuando todos los encuentros son futuros y programados."
      : "";

  return (
    <>
      <section className="meeting-danger-zone">
        <div>
          <h2>Eliminar reunión completa</h2>
          <p>Elimina la reunión y todos sus encuentros futuros, incluidos sus eventos de Calendar.</p>
          {removeAllBlockedReason ? <p className="danger-note">{removeAllBlockedReason}</p> : null}
          {message ? <p className="form-message meeting-detail-message" role="alert">{message}</p> : null}
        </div>
        <button
          className="secondary-action danger-action"
          disabled={!canRemoveAll || busy !== null}
          onClick={removeAll}
          title={removeAllBlockedReason || "Eliminar reunión completa"}
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
          <label className="check-field encounter-add-check"><input name="requiereGrabacion" type="checkbox" /><span>Debe grabarse</span></label>
          <button className="primary-action" disabled={busy !== null} type="submit"><CalendarPlus size={17} />Agregar</button>
        </form>
      </section>

      <section className="encounter-list-heading">
        <div><h2>Todos los encuentros</h2><p>{meetings.length} instancias ordenadas cronológicamente.</p></div>
        <div className="encounter-time-legend" aria-label="Referencia temporal">
          <span className="future">Futuros</span><span className="current">En curso</span><span className="past">Pasados</span>
        </div>
      </section>
      <div className="encounter-list">
        {meetings.map((meeting) => (
          <article className={`encounter-item is-${meeting.temporalidad.toLowerCase().replace("_", "-")}`} key={meeting.id}>
            <header>
              <span><strong>Encuentro {meeting.ordinal}</strong><small>{meeting.host}{meeting.codigoMeet ? ` · ${meeting.codigoMeet}` : ""}</small></span>
              <div className="encounter-statuses">
                <span className={`encounter-time-status ${meeting.temporalidad.toLowerCase().replace("_", "-")}`}>{temporalLabel(meeting.temporalidad)}</span>
                <span className={`status status-${meeting.estado === "CANCELADA" || meeting.estado === "NO_REALIZADA" ? "error" : meeting.estado === "PROGRAMADA" ? "ok" : "neutral"}`}>{meeting.estado.toLowerCase().replaceAll("_", " ")}</span>
              </div>
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
                <button className="icon-button danger-action" disabled={!meeting.editable || busy !== null || meeting.encuentrosEnSolicitud <= 1} onClick={() => remove(meeting.id)} title={meeting.encuentrosEnSolicitud <= 1 ? "Usá Eliminar todo para borrar esta reunión" : "Eliminar encuentro"} type="button"><Trash2 size={17} /><span className="sr-only">Eliminar encuentro</span></button>
              </div>
            </div>
          </article>
        ))}
      </div>
    </>
  );
}

function temporalLabel(temporalidad: Encounter["temporalidad"]): string {
  if (temporalidad === "PASADO") return "Pasado";
  if (temporalidad === "EN_CURSO") return "En curso";
  return "Futuro";
}

function localMontevideoToIso(formData: FormData, timeField: string): string {
  return `${String(formData.get("fecha"))}T${String(formData.get(timeField))}:00-03:00`;
}
