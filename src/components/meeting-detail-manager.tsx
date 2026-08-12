"use client";

import { CalendarClock, CalendarPlus, History, LoaderCircle, Save, Trash2, UserRoundMinus, UserRoundPlus } from "lucide-react";
import { useRouter } from "next/navigation";
import { useRef, useState } from "react";
import { MeetLinkActions } from "@/src/components/copy-meet-link-button";
import {
  filtrarEncuentrosPorVista,
  type VistaTemporalEncuentros
} from "@/src/modules/reuniones/filtro-encuentros.domain";

type Encounter = Readonly<{
  id: string;
  solicitudId: string;
  encuentrosEnSolicitud: number;
  ordinal: number;
  descripcion: string | null;
  inicio: string;
  fin: string;
  estado: string;
  requiereAsistenciaTecnica: boolean;
  asistenteTecnico: string | null;
  postulantes: number;
  host: string;
  codigoMeet: string | null;
  joinUrl: string | null;
  editable: boolean;
  esDeHoy: boolean;
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
  const [vistaTemporal, setVistaTemporal] = useState<VistaTemporalEncuentros>("PROXIMOS");
  const removingAllRef = useRef(false);

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
        descripcion: formData.get("descripcion") || undefined,
        requiereAsistenciaTecnica: formData.get("requiereAsistenciaTecnica") === "on",
        requiereGrabacion: formData.get("requiereGrabacion") === "on"
      })
    });
  }

  function edit(id: string, formData: FormData) {
    return request(meetings.find((meeting) => meeting.id === id)?.solicitudId ?? solicitudId, id, {
      method: "PATCH",
      body: JSON.stringify({
        accion: "EDITAR_ENCUENTRO",
        inicio: localMontevideoToIso(formData, "horaInicio"),
        fin: localMontevideoToIso(formData, "horaFin"),
        descripcion: formData.get("descripcion") ?? ""
      })
    });
  }

  function changeAssistance(id: string, value: boolean) {
    return request(meetings.find((meeting) => meeting.id === id)?.solicitudId ?? solicitudId, id, {
      method: "PATCH",
      body: JSON.stringify({ accion: "CAMBIAR_ASISTENCIA", requiereAsistenciaTecnica: value })
    });
  }

  function remove(id: string) {
    if (!window.confirm("Se cancelará el evento de Calendar y se eliminará este encuentro. ¿Continuar?")) return;
    return request(meetings.find((meeting) => meeting.id === id)?.solicitudId ?? solicitudId, id, { method: "DELETE" });
  }

  async function removeAll() {
    if (removingAllRef.current) return;
    if (!window.confirm("Se cancelarán todos los eventos de Calendar y se eliminará la reunión completa. Esta acción no se puede deshacer. ¿Continuar?")) return;
    removingAllRef.current = true;
    setBusy("all");
    setMessage(`Eliminando ${meetings.length} encuentros de Google Calendar. Puede demorar unos minutos…`);
    try {
      for (const requestId of requestIds) {
        const response = await fetch(`/api/v1/reuniones/${requestId}/encuentros`, { method: "DELETE" });
        if (!response.ok) {
          const result = await response.json().catch(() => ({}));
          throw new Error(result.error ?? "No se pudo eliminar la reunión completa.");
        }
      }
      router.push("/reuniones");
      router.refresh();
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "No se pudo conectar con el servidor. Intentá nuevamente.");
    } finally {
      removingAllRef.current = false;
      setBusy(null);
    }
  }

  const canRemoveAll = meetings.length > 0 && meetings.every(({ editable }) => editable);
  const removeAllBlockedReason = meetings.length === 0
    ? "La reunión no tiene encuentros para eliminar."
    : !canRemoveAll
      ? "Solo se puede eliminar completa cuando todos los encuentros son futuros y programados."
      : "";
  const proximos = filtrarEncuentrosPorVista(meetings, "PROXIMOS");
  const pasados = filtrarEncuentrosPorVista(meetings, "PASADOS");
  const visibleMeetings = vistaTemporal === "PROXIMOS" ? proximos : pasados;

  return (
    <>
      <section className="meeting-danger-zone">
        <div>
          <h2>Eliminar reunión completa</h2>
          <p>Elimina la reunión y todos sus encuentros futuros, incluidos sus eventos de Calendar.</p>
          {removeAllBlockedReason ? <p className="danger-note">{removeAllBlockedReason}</p> : null}
          {message ? <p className="form-message meeting-detail-message" role={busy === "all" ? "status" : "alert"}>{message}</p> : null}
        </div>
        <button
          className="secondary-action danger-action"
          disabled={!canRemoveAll || busy !== null}
          onClick={removeAll}
          title={removeAllBlockedReason || "Eliminar reunión completa"}
          type="button"
        >
          {busy === "all" ? <LoaderCircle className="button-spinner" size={17} /> : <Trash2 size={17} />}
          {busy === "all" ? `Eliminando ${meetings.length}…` : "Eliminar todo"}
        </button>
      </section>
      <section className="content-section add-encounter-section">
        <div className="section-heading"><div><h2>Agregar encuentro</h2><p>Se asignará una sala Meet disponible.</p></div></div>
        <form className="encounter-add-form" action={add}>
          <label className="field"><span>Fecha</span><input name="fecha" type="date" required /></label>
          <label className="field"><span>Hora de inicio</span><input name="horaInicio" type="time" required /></label>
          <label className="field"><span>Hora de fin</span><input name="horaFin" type="time" required /></label>
          <label className="check-field encounter-add-check"><input name="requiereAsistenciaTecnica" type="checkbox" /><span>Asistencia técnica</span></label>
          <label className="check-field encounter-add-check"><input name="requiereGrabacion" type="checkbox" /><span>Debe grabarse</span></label>
          <button className="primary-action" disabled={busy !== null} type="submit"><CalendarPlus size={17} />Agregar</button>
          <label className="field encounter-add-description"><span>Descripción del encuentro (opcional)</span><textarea name="descripcion" placeholder="Tema, docente o indicaciones específicas" rows={2} /></label>
        </form>
      </section>

      <section className="encounter-list-heading">
        <div>
          <h2>{vistaTemporal === "PROXIMOS" ? "Próximos encuentros y de hoy" : "Encuentros pasados"}</h2>
          <p>{visibleMeetings.length} instancias ordenadas cronológicamente.</p>
        </div>
        <div className="encounter-time-filter" aria-label="Filtrar encuentros">
          <button
            aria-pressed={vistaTemporal === "PROXIMOS"}
            className={vistaTemporal === "PROXIMOS" ? "active" : ""}
            onClick={() => setVistaTemporal("PROXIMOS")}
            type="button"
          >
            <CalendarClock size={16} />Próximas y de hoy <span>{proximos.length}</span>
          </button>
          <button
            aria-pressed={vistaTemporal === "PASADOS"}
            className={vistaTemporal === "PASADOS" ? "active" : ""}
            onClick={() => setVistaTemporal("PASADOS")}
            type="button"
          >
            <History size={16} />Pasadas <span>{pasados.length}</span>
          </button>
        </div>
      </section>
      <div className="encounter-list">
        {visibleMeetings.length === 0 ? (
          <div className="content-section empty-state encounter-empty-state">
            <CalendarClock size={22} aria-hidden="true" />
            <p>{vistaTemporal === "PROXIMOS" ? "No hay encuentros para hoy ni próximos." : "No hay encuentros pasados."}</p>
          </div>
        ) : null}
        {visibleMeetings.map((meeting) => (
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
              <button className="secondary-action" disabled={!meeting.editable || busy !== null} type="submit"><Save size={16} />Guardar cambios</button>
              <label className="field encounter-description-field"><span>Descripción del encuentro</span><textarea name="descripcion" defaultValue={meeting.descripcion ?? ""} disabled={!meeting.editable || busy !== null} placeholder="Tema, docente o indicaciones específicas" rows={3} /></label>
            </form>
            <div className="encounter-assistance">
              <span>
                <strong>{meeting.requiereAsistenciaTecnica ? "Asistencia técnica solicitada" : "Sin asistencia técnica"}</strong>
                <small>{meeting.asistenteTecnico ? `Asignada a ${meeting.asistenteTecnico}` : meeting.requiereAsistenciaTecnica ? `${meeting.postulantes} postulaciones` : ""}</small>
              </span>
              <div className="encounter-actions">
                {meeting.requiereAsistenciaTecnica ? (
                  <button className="secondary-action" disabled={!meeting.editable || busy !== null} onClick={() => changeAssistance(meeting.id, false)} type="button"><UserRoundMinus size={16} />Cancelar asistencia técnica</button>
                ) : (
                  <button className="secondary-action" disabled={!meeting.editable || busy !== null} onClick={() => changeAssistance(meeting.id, true)} type="button"><UserRoundPlus size={16} />Pedir asistencia técnica</button>
                )}
                {meeting.joinUrl ? <MeetLinkActions openClassName="secondary-action" url={meeting.joinUrl} /> : null}
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
