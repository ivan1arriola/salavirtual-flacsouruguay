"use client";

import {
  CalendarClock,
  CalendarPlus,
  History,
  LoaderCircle,
  Pencil,
  Save,
  Trash2,
  UserRoundMinus,
  UserRoundPlus,
  X
} from "lucide-react";
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
  fechaLegible: string;
  estado: string;
  requiereAsistenciaTecnica: boolean;
  asistenteTecnico: string | null;
  postulantes: number;
  cuentaGoogle: string;
  codigoMeet: string | null;
  joinUrl: string | null;
  editable: boolean;
  puedeCambiarAsistencia: boolean;
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
  const [editingId, setEditingId] = useState<string | null>(null);
  const [vistaTemporal, setVistaTemporal] = useState<VistaTemporalEncuentros>("PROXIMOS");
  const removingAllRef = useRef(false);

  async function request(requestId: string, id: string, init: RequestInit): Promise<boolean> {
    setBusy(id);
    setMessage("");
    try {
      const response = await fetch(`/api/v1/reuniones/${requestId}/encuentros${id ? `/${id}` : ""}`, {
        ...init,
        headers: { "Content-Type": "application/json" }
      });
      const result = await response.json().catch(() => ({}));
      setMessage(response.ok ? result.message ?? "Cambios guardados." : result.error ?? "No se pudo completar la operación.");
      if (response.ok) {
        router.refresh();
        return true;
      }
      return false;
    } catch {
      setMessage("No se pudo conectar con el servidor. Intentá nuevamente.");
      return false;
    } finally {
      setBusy(null);
    }
  }

  async function add(formData: FormData): Promise<void> {
    await request(solicitudId, "", {
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

  async function edit(id: string, formData: FormData) {
    const updated = await request(meetings.find((meeting) => meeting.id === id)?.solicitudId ?? solicitudId, id, {
      method: "PATCH",
      body: JSON.stringify({
        accion: "EDITAR_ENCUENTRO",
        inicio: localMontevideoToIso(formData, "horaInicio"),
        fin: localMontevideoToIso(formData, "horaFin"),
        descripcion: formData.get("descripcion") ?? ""
      })
    });
    if (updated) setEditingId(null);
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
    if (!window.confirm("Se cancelarán todos los eventos de Calendar y se eliminará la serie completa. Esta acción no se puede deshacer. ¿Continuar?")) return;
    removingAllRef.current = true;
    setBusy("all");
    setMessage(`Eliminando ${meetings.length} encuentros de Google Calendar. Puede demorar unos minutos…`);
    try {
      for (const requestId of requestIds) {
        const response = await fetch(`/api/v1/reuniones/${requestId}/encuentros`, { method: "DELETE" });
        if (!response.ok) {
          const result = await response.json().catch(() => ({}));
          throw new Error(result.error ?? "No se pudo eliminar la serie completa.");
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

  const canRemoveAll = meetings.length > 0;
  const removeAllBlockedReason = meetings.length === 0
    ? "La reunión no tiene encuentros para eliminar."
    : "";
  const proximos = filtrarEncuentrosPorVista(meetings, "PROXIMOS");
  const pasados = filtrarEncuentrosPorVista(meetings, "PASADOS");
  const visibleMeetings = vistaTemporal === "PROXIMOS" ? proximos : pasados;

  return (
    <>
      {message ? (
        <p className="meeting-detail-feedback" aria-live="polite">{message}</p>
      ) : null}

      <section className="encounter-list-heading">
        <div>
          <h2>{vistaTemporal === "PROXIMOS" ? "Próximos encuentros y de hoy" : "Encuentros pasados"}</h2>
          <p>{visibleMeetings.length} instancias ordenadas cronológicamente.</p>
        </div>
        <div className="encounter-list-tools">
          <div className="encounter-time-filter" aria-label="Filtrar encuentros">
            <button
              aria-pressed={vistaTemporal === "PROXIMOS"}
              className={vistaTemporal === "PROXIMOS" ? "active" : ""}
              onClick={() => setVistaTemporal("PROXIMOS")}
              type="button"
            >
              <CalendarClock size={16} />Próximas <span>{proximos.length}</span>
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
          <a className="secondary-action encounter-add-shortcut" href="#agregar-encuentro">
            <CalendarPlus size={16} />Agregar
          </a>
        </div>
      </section>

      <div className="encounter-list">
        {visibleMeetings.length === 0 ? (
          <div className="content-section empty-state encounter-empty-state">
            <CalendarClock size={22} aria-hidden="true" />
            <p>{vistaTemporal === "PROXIMOS" ? "No hay encuentros para hoy ni próximos." : "No hay encuentros pasados."}</p>
          </div>
        ) : null}
        {visibleMeetings.map((meeting) => {
          const editing = editingId === meeting.id;
          return (
            <article className={`encounter-item encounter-card is-${meeting.temporalidad.toLowerCase().replace("_", "-")}`} key={meeting.id}>
              <header>
                <span className="encounter-title">
                  <strong>Encuentro {meeting.ordinal}</strong>
                  <small className="encounter-date-summary">{meeting.fechaLegible} · {meeting.inicio.slice(11, 16)}–{meeting.fin.slice(11, 16)}</small>
                </span>
                <div className="encounter-statuses">
                  {meeting.esDeHoy ? <span className="status status-warning">Hoy</span> : null}
                  <span className={`encounter-time-status ${meeting.temporalidad.toLowerCase().replace("_", "-")}`}>{temporalLabel(meeting.temporalidad)}</span>
                  <span className={`status status-${meeting.estado === "CANCELADA" || meeting.estado === "NO_REALIZADA" ? "error" : meeting.estado === "PROGRAMADA" ? "ok" : "neutral"}`}>{meeting.estado.toLowerCase().replaceAll("_", " ")}</span>
                </div>
              </header>

              {!editing ? (
                <>
                  <div className="encounter-read-body">
                    <div className="encounter-read-primary">
                      <span className="encounter-read-label">Descripción</span>
                      <p>{meeting.descripcion?.trim() || "Sin descripción específica para este encuentro."}</p>
                    </div>
                    <dl className="encounter-facts">
                      <div>
                        <dt>Cuenta Google</dt>
                        <dd>{meeting.cuentaGoogle}</dd>
                      </div>
                      <div>
                        <dt>Código Meet</dt>
                        <dd>{meeting.codigoMeet ?? "Pendiente"}</dd>
                      </div>
                      <div>
                        <dt>Asistencia técnica</dt>
                        <dd>{meeting.asistenteTecnico
                          ? meeting.asistenteTecnico
                          : meeting.requiereAsistenciaTecnica
                            ? `${meeting.postulantes} ${meeting.postulantes === 1 ? "postulación" : "postulaciones"}`
                            : "No requiere"}</dd>
                      </div>
                    </dl>
                  </div>
                  <footer className="encounter-card-actions">
                    <div className="encounter-card-primary-actions">
                      {meeting.joinUrl ? <MeetLinkActions openClassName="primary-action" url={meeting.joinUrl} /> : <span className="muted-text">Enlace Meet pendiente</span>}
                    </div>
                    <div className="encounter-card-secondary-actions">
                      {meeting.editable ? (
                        <button className="secondary-action" disabled={busy !== null} onClick={() => setEditingId(meeting.id)} type="button">
                          <Pencil size={16} />Editar
                        </button>
                      ) : null}
                      {meeting.requiereAsistenciaTecnica ? (
                        <button className="secondary-action" disabled={!meeting.puedeCambiarAsistencia || busy !== null} onClick={() => changeAssistance(meeting.id, false)} type="button"><UserRoundMinus size={16} />Cancelar asistencia</button>
                      ) : (
                        <button className="secondary-action" disabled={!meeting.puedeCambiarAsistencia || busy !== null} onClick={() => changeAssistance(meeting.id, true)} type="button"><UserRoundPlus size={16} />Pedir asistencia</button>
                      )}
                      <button className="icon-button danger-action" disabled={!meeting.editable || busy !== null || meeting.encuentrosEnSolicitud <= 1} onClick={() => remove(meeting.id)} title={meeting.encuentrosEnSolicitud <= 1 ? "Usá Eliminar reunión para borrar la serie completa" : "Eliminar encuentro"} type="button"><Trash2 size={17} /><span className="sr-only">Eliminar encuentro</span></button>
                    </div>
                  </footer>
                </>
              ) : (
                <div className="encounter-editor">
                  <div className="encounter-editor-heading">
                    <div><strong>Editar encuentro</strong><small>Modificá solo los datos que necesites.</small></div>
                    <button className="icon-button" onClick={() => setEditingId(null)} title="Cerrar edición" type="button"><X size={17} /><span className="sr-only">Cerrar edición</span></button>
                  </div>
                  <form className="encounter-edit-form" action={(formData) => edit(meeting.id, formData)}>
                    <label className="field"><span>Fecha</span><input name="fecha" type="date" defaultValue={meeting.inicio.slice(0, 10)} disabled={!meeting.editable || busy !== null} required /></label>
                    <label className="field"><span>Hora de inicio</span><input name="horaInicio" type="time" defaultValue={meeting.inicio.slice(11, 16)} disabled={!meeting.editable || busy !== null} required /></label>
                    <label className="field"><span>Hora de fin</span><input name="horaFin" type="time" defaultValue={meeting.fin.slice(11, 16)} disabled={!meeting.editable || busy !== null} required /></label>
                    <button className="primary-action" disabled={!meeting.editable || busy !== null} type="submit">{busy === meeting.id ? <LoaderCircle className="button-spinner" size={16} /> : <Save size={16} />}Guardar</button>
                    <label className="field encounter-description-field"><span>Descripción del encuentro</span><textarea name="descripcion" defaultValue={meeting.descripcion ?? ""} disabled={!meeting.editable || busy !== null} placeholder="Tema, docente o indicaciones específicas" rows={3} /></label>
                  </form>
                </div>
              )}
            </article>
          );
        })}
      </div>

      <section className="content-section add-encounter-section" id="agregar-encuentro">
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

      <section className="meeting-advanced-actions">
        <details>
          <summary>Acciones avanzadas</summary>
          <div className="meeting-danger-zone">
            <div>
              <h2>Eliminar serie completa</h2>
              <p>Cancela la serie y todos sus eventos de Calendar, incluso si algún encuentro ya ocurrió.</p>
              {removeAllBlockedReason ? <p className="danger-note">{removeAllBlockedReason}</p> : null}
            </div>
            <button
              className="secondary-action danger-action"
              disabled={!canRemoveAll || busy !== null}
              onClick={removeAll}
              title={removeAllBlockedReason || "Eliminar serie completa"}
              type="button"
            >
              {busy === "all" ? <LoaderCircle className="button-spinner" size={17} /> : <Trash2 size={17} />}
              {busy === "all" ? `Eliminando ${meetings.length}…` : "Eliminar serie"}
            </button>
          </div>
        </details>
      </section>
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