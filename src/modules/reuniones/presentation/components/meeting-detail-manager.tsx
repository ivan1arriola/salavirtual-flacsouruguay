"use client";

import {
  CalendarClock,
  CalendarPlus,
  ClipboardList,
  ChevronDown,
  History,
  LoaderCircle,
  Pencil,
  Save,
  Trash2,
  UserRoundMinus,
  UserRoundPlus,
  UsersRound,
  Video,
  Wrench,
  X
} from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useRef, useState } from "react";
import { MeetLinkActions } from "@/src/components/copy-meet-link-button";
import { MeetingScheduleTimes } from "@/src/components/meeting-schedule-times";
import { planEliminacionEncuentro } from "@/src/modules/reuniones/eliminacion-encuentro.domain";
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
  modalidad: "HIBRIDA" | "VIRTUAL";
  modalidadPersonalizada: boolean;
  requiereAsistenciaTecnica: boolean;
  inicioAsistencia: string | null;
  finAsistencia: string | null;
  horarioAsistenciaPersonalizado: boolean;
  horarioAsistenciaBaseDisponible: boolean;
  asistenteTecnico: string | null;
  postulantes: number;
  organizerAccount: string;
  cohosts: readonly string[];
  cohostsConfirmados?: boolean;
  verifiedCohostEmails?: readonly string[];
  codigoMeet: string | null;
  joinUrl: string | null;
  grabacionUrl?: string | null;
  asistenciaUrl?: string | null;
  driveFolderUrl?: string | null;
  editable: boolean;
  puedeCambiarAsistencia: boolean;
  esDeHoy: boolean;
  temporalidad: "PASADO" | "EN_CURSO" | "FUTURO";
}>;

export function MeetingDetailManager({
  solicitudId,
  requestIds,
  meetings,
  canManageOperationalOverrides
}: Readonly<{
  solicitudId: string;
  requestIds: readonly string[];
  meetings: readonly Encounter[];
  canManageOperationalOverrides: boolean;
}>) {
  const router = useRouter();
  const [busy, setBusy] = useState<string | null>(null);
  const [message, setMessage] = useState("");
  const [editingId, setEditingId] = useState<string | null>(null);
  const [operationalEditor, setOperationalEditor] = useState<Readonly<{
    id: string;
    type: "MODALIDAD" | "ASISTENCIA";
  }> | null>(null);
  const [vistaTemporal, setVistaTemporal] = useState<VistaTemporalEncuentros>("PROXIMOS");
  const [expandedIds, setExpandedIds] = useState<ReadonlySet<string>>(
    () => new Set(meetings.slice(0, 1).map((meeting) => meeting.id)),
  );
  const [addingOpen, setAddingOpen] = useState(false);
  const removingAllRef = useRef(false);
  const addSectionRef = useRef<HTMLDetailsElement>(null);

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
    const added = await request(solicitudId, "", {
      method: "POST",
      body: JSON.stringify({
        inicio: localMontevideoToIso(formData, "horaInicio"),
        fin: localMontevideoToIso(formData, "horaFin"),
        descripcion: formData.get("descripcion") || undefined,
        inicioAsistenciaTecnica: formData.get("horaAsistenciaInicio")
          ? localMontevideoToIso(formData, "horaAsistenciaInicio")
          : undefined,
        finAsistenciaTecnica: formData.get("horaAsistenciaFin")
          ? localMontevideoToIso(formData, "horaAsistenciaFin")
          : undefined,
        requiereAsistenciaTecnica: formData.get("requiereAsistenciaTecnica") === "on",
        requiereGrabacion: formData.get("requiereGrabacion") === "on"
      })
    });
    if (added) setAddingOpen(false);
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
    const meeting = meetings.find((item) => item.id === id);
    if (
      value &&
      meeting?.modalidad === "HIBRIDA" &&
      (!meeting.inicioAsistencia || !meeting.finAsistencia) &&
      canManageOperationalOverrides
    ) {
      setOperationalEditor({ id, type: "ASISTENCIA" });
      setMessage("Definí primero la hora exacta de llegada y salida del asistente para este encuentro híbrido.");
      return Promise.resolve(false);
    }
    return request(meeting?.solicitudId ?? solicitudId, id, {
      method: "PATCH",
      body: JSON.stringify({ accion: "CAMBIAR_ASISTENCIA", requiereAsistenciaTecnica: value })
    });
  }

  async function changeModality(id: string, formData: FormData) {
    const updated = await request(meetings.find((meeting) => meeting.id === id)?.solicitudId ?? solicitudId, id, {
      method: "PATCH",
      body: JSON.stringify({
        accion: "CAMBIAR_MODALIDAD",
        modalidad: formData.get("modalidad")
      })
    });
    if (updated) setOperationalEditor(null);
  }

  async function resetModality(id: string) {
    const updated = await request(meetings.find((meeting) => meeting.id === id)?.solicitudId ?? solicitudId, id, {
      method: "PATCH",
      body: JSON.stringify({ accion: "CAMBIAR_MODALIDAD", modalidad: null })
    });
    if (updated) setOperationalEditor(null);
  }

  async function changeAssistanceSchedule(id: string, formData: FormData) {
    const updated = await request(meetings.find((meeting) => meeting.id === id)?.solicitudId ?? solicitudId, id, {
      method: "PATCH",
      body: JSON.stringify({
        accion: "EDITAR_HORARIO_ASISTENCIA",
        inicioAsistenciaTecnica: localMontevideoToIso(formData, "horaAsistenciaInicio"),
        finAsistenciaTecnica: localMontevideoToIso(formData, "horaAsistenciaFin")
      })
    });
    if (updated) setOperationalEditor(null);
  }

  async function resetAssistanceSchedule(id: string) {
    const updated = await request(meetings.find((meeting) => meeting.id === id)?.solicitudId ?? solicitudId, id, {
      method: "PATCH",
      body: JSON.stringify({ accion: "RESTABLECER_HORARIO_ASISTENCIA" })
    });
    if (updated) setOperationalEditor(null);
  }

  function planEliminacion(meeting: Encounter) {
    return planEliminacionEncuentro({
      editable: meeting.editable,
      ocupado: busy !== null,
      encuentrosEnSolicitud: meeting.encuentrosEnSolicitud,
      encuentrosEnPagina: meetings.length,
    });
  }

  async function cancelarSolicitudDelEncuentro(meeting: Encounter): Promise<boolean> {
    setBusy(meeting.id);
    setMessage("Registrando la cancelación del encuentro…");
    try {
      const response = await fetch("/api/v1/reuniones/cancelar-serie", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ solicitudIds: [meeting.solicitudId] })
      });
      const result = await response.json().catch(() => ({}));
      setMessage(response.ok ? result.message ?? "Cancelación registrada." : result.error ?? "No se pudo cancelar el encuentro.");
      if (response.ok) router.refresh();
      return response.ok;
    } catch {
      setMessage("No se pudo conectar con el servidor. Intentá nuevamente.");
      return false;
    } finally {
      setBusy(null);
    }
  }

  async function remove(id: string) {
    const meeting = meetings.find((item) => item.id === id);
    if (!meeting) return;
    const plan = planEliminacion(meeting);
    if (!plan.habilitado) return;
    if (plan.modo === "SOLICITUD") {
      if (!window.confirm("Se cancelará este encuentro y su evento de Calendar. Los demás encuentros de la serie no cambian. ¿Continuar?")) return;
      await cancelarSolicitudDelEncuentro(meeting);
      return;
    }
    if (!window.confirm("Se cancelará el evento de Calendar y se eliminará este encuentro. ¿Continuar?")) return;
    await request(meeting.solicitudId ?? solicitudId, id, { method: "DELETE" });
  }

  async function removeAll() {
    if (removingAllRef.current || requestIds.length === 0) return;
    if (!window.confirm("Se registrará la cancelación de toda la serie. Google Calendar podría tardar unos minutos en reflejarla. ¿Continuar?")) return;
    removingAllRef.current = true;
    setBusy("all");
    setMessage("Registrando la cancelación de la serie…");
    try {
      const response = await fetch("/api/v1/reuniones/cancelar-serie", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ solicitudIds: requestIds })
      });
      const result = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(result.error ?? "No se pudo cancelar la serie.");
      setMessage(result.message ?? "Cancelación registrada.");
      router.push("/reuniones");
      router.refresh();
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Error al cancelar la serie.");
      router.refresh();
    } finally {
      removingAllRef.current = false;
      setBusy(null);
    }
  }

  function openAddEncounter() {
    setAddingOpen(true);
    window.requestAnimationFrame(() => {
      addSectionRef.current?.scrollIntoView({ behavior: "smooth", block: "nearest" });
    });
  }

  const canRemoveAll = meetings.length > 0;
  const removeAllBlockedReason = meetings.length === 0
    ? "La reunión no tiene encuentros para eliminar."
    : "";
  const proximos = filtrarEncuentrosPorVista(meetings, "PROXIMOS");
  const pasados = filtrarEncuentrosPorVista(meetings, "PASADOS");
  const visibleMeetings = filtrarEncuentrosPorVista(meetings, vistaTemporal);

  function toggleExpanded(id: string): void {
    setExpandedIds((current) => {
      const next = new Set(current);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  return (
    <section className="meeting-encounters-v2 meeting-detail-section" aria-labelledby="meeting-encounters-title">
      {message ? <p className="meeting-detail-feedback" aria-live="polite">{message}</p> : null}

      <div className="encounter-list-heading encounter-list-heading-v2">
        <div>
          <p className="section-eyebrow">Cronograma</p>
          <h2 id="meeting-encounters-title">Encuentros</h2>
          <p>Entrá a Meet, revisá los cohosts o administrá cada fecha desde un solo lugar.</p>
        </div>
        <div className="encounter-list-tools">
          <div className="encounter-time-filter" aria-label="Filtrar encuentros">
            <button aria-pressed={vistaTemporal === "TODOS"} className={vistaTemporal === "TODOS" ? "active" : ""} onClick={() => setVistaTemporal("TODOS")} type="button">Todos <span>{meetings.length}</span></button>
            <button
              aria-pressed={vistaTemporal === "PROXIMOS"}
              className={vistaTemporal === "PROXIMOS" ? "active" : ""}
              onClick={() => setVistaTemporal("PROXIMOS")}
              type="button"
            >
              <CalendarClock size={16} />Próximos <span>{proximos.length}</span>
            </button>
            <button
              aria-pressed={vistaTemporal === "PASADOS"}
              className={vistaTemporal === "PASADOS" ? "active" : ""}
              onClick={() => setVistaTemporal("PASADOS")}
              type="button"
            >
              <History size={16} />Pasados <span>{pasados.length}</span>
            </button>
          </div>
          <button className="secondary-action encounter-add-shortcut" type="button" onClick={openAddEncounter}>
            <CalendarPlus size={16} />Agregar
          </button>
        </div>
      </div>

      <div className="encounter-list encounter-list-v2">
        {visibleMeetings.length === 0 ? (
          <div className="content-section empty-state encounter-empty-state">
            <CalendarClock size={22} aria-hidden="true" />
            <p>{vistaTemporal === "PROXIMOS" ? "No hay encuentros para hoy ni próximos." : vistaTemporal === "PASADOS" ? "No hay encuentros pasados." : "Todavía no hay encuentros en esta serie."}</p>
          </div>
        ) : null}

        {visibleMeetings.map((meeting) => {
          const editing = editingId === meeting.id;
          const assistance = assistanceLabel(meeting);
          const expanded = expandedIds.has(meeting.id) || editing || operationalEditor?.id === meeting.id;
          return (
            <article className={`encounter-item encounter-card encounter-card-v2 is-${meeting.temporalidad.toLowerCase().replace("_", "-")}`} key={meeting.id}>
              <header className="encounter-v2-header">
                <div className="encounter-v2-heading">
                  <span className="encounter-v2-number"><strong>{meeting.ordinal}</strong><small>{meeting.inicio.slice(5, 7) === "10" ? "OCT" : meeting.inicio.slice(5, 7) === "11" ? "NOV" : meeting.inicio.slice(5, 7) === "12" ? "DIC" : meeting.inicio.slice(5, 7) === "09" ? "SEP" : meeting.inicio.slice(5, 7) === "08" ? "AGO" : "MES"}</small></span>
                  <div>
                    <strong>Encuentro {meeting.ordinal}</strong>
                    <span>{meeting.fechaLegible}</span>
                    <small>Encuentro: {meeting.inicio.slice(11, 16)}–{meeting.fin.slice(11, 16)}</small>
                    {meeting.requiereAsistenciaTecnica ? <small>Monitoreo: {(meeting.inicioAsistencia ?? meeting.inicio).slice(11, 16)}–{(meeting.finAsistencia ?? meeting.fin).slice(11, 16)}</small> : null}
                    <small>
                      {meeting.modalidad === "HIBRIDA" ? "Híbrida" : "Virtual"}
                      {meeting.modalidadPersonalizada ? " · configuración puntual" : ""}
                    </small>
                  </div>
                </div>
                <div className="encounter-statuses">
                  {meeting.esDeHoy ? <span className="status status-warning">Hoy</span> : null}
                  <span className={`encounter-time-status ${meeting.temporalidad.toLowerCase().replace("_", "-")}`}>{temporalLabel(meeting.temporalidad)}</span>
                  <span className={`status status-${meeting.estado === "CANCELADA" || meeting.estado === "NO_REALIZADA" ? "error" : meeting.estado === "PROGRAMADA" ? "ok" : "neutral"}`}>
                    {meeting.estado.toLowerCase().replaceAll("_", " ")}
                  </span>
                </div>
                <div className="encounter-v2-shortcuts">
                  {meeting.temporalidad !== "FUTURO" ? (
                    <Link
                      className="encounter-attendance-link"
                      href={`/reuniones/${meeting.solicitudId}/encuentros/${meeting.id}/asistencia`}
                      aria-label={`Ver asistencia del encuentro ${meeting.ordinal}`}
                    >
                      <ClipboardList size={16} aria-hidden="true" />
                      <span>Asistencia</span>
                    </Link>
                  ) : null}
                  <button
                    aria-expanded={expanded}
                    className="encounter-expand-toggle"
                    onClick={() => toggleExpanded(meeting.id)}
                    type="button"
                  >
                    <span>{expanded ? "Ocultar detalles" : "Ver detalles"}</span>
                    <ChevronDown size={16} aria-hidden="true" />
                  </button>
                </div>
              </header>

              <div className={`encounter-v2-content${expanded ? " is-expanded" : ""}`}>
              {!editing ? (
                <>
                  <div className="encounter-v2-body">
                    <div className="encounter-v2-main">
                      <MeetingScheduleTimes startsAt={meeting.inicio + ":00-03:00"} endsAt={meeting.fin + ":00-03:00"} requiresAssistance={meeting.requiereAsistenciaTecnica} modality={meeting.modalidad} assistanceStartsAt={meeting.inicioAsistencia ? meeting.inicioAsistencia + ":00-03:00" : null} assistanceEndsAt={meeting.finAsistencia ? meeting.finAsistencia + ":00-03:00" : null} compact />
                      <div className="encounter-v2-description">
                        <span>Detalle del encuentro</span>
                        <p>{meeting.descripcion?.trim() || "Sin descripción específica para este encuentro."}</p>
                      </div>

                      <div className={`encounter-v2-meet ${meeting.joinUrl ? "is-ready" : "is-pending"}`}>
                        <Video size={22} aria-hidden="true" />
                        <div>
                          <span>Google Meet</span>
                          <strong>{meeting.codigoMeet ?? "Enlace pendiente"}</strong>
                          <small>{meeting.joinUrl ? "La sala está lista para ingresar." : "Google todavía está terminando de configurar la sala."}</small>
                        </div>
                        <div className="encounter-v2-meet-actions">
                          {meeting.joinUrl && meeting.temporalidad === "EN_CURSO" ? (
                            <a className="secondary-action" href={`/operacion/${meeting.id}`} aria-label="Operar encuentro actual">Operar</a>
                          ) : null}
                          {meeting.joinUrl
                            ? <MeetLinkActions openClassName="primary-action" url={meeting.joinUrl} />
                            : <span className="muted-text">No disponible todavía</span>}
                        </div>
                      </div>

                    </div>

                    <aside className="encounter-v2-people">
                      <div className="encounter-v2-people-block">
                        <div className="encounter-v2-people-title"><UsersRound size={17} /><span>{meeting.cohostsConfirmados ? "Cohosts verificados en Google" : "Cohosts pendientes de verificación"}</span></div>
                        {meeting.cohosts.length ? (
                          <div className="encounter-v2-cohost-list">
                            {meeting.cohosts.map((cohost) => { const confirmed = meeting.verifiedCohostEmails?.some((email) => cohost.toLowerCase().includes(email.toLowerCase())); return <span key={cohost} title={confirmed ? "Verificado en Google Meet" : "Verificación pendiente"} style={{ display: "flex", alignItems: "center", gap: 6 }}><span aria-label={confirmed ? "Verificado" : "Pendiente"} style={{ color: confirmed ? "#177245" : "#737b8c", fontWeight: 700 }}>{confirmed ? "✓" : "○"}</span>{cohost}</span>; })}
                          </div>
                        ) : <strong className="muted-text">Sin cohosts configurados</strong>}
                      </div>

                      <div className="encounter-v2-people-block">
                        <div className="encounter-v2-people-title"><Wrench size={17} /><span>Monitoreo</span></div>
                        <strong>{assistance.title}</strong>
                        {assistance.detail ? <small>{assistance.detail}</small> : null}
                        {meeting.requiereAsistenciaTecnica ? (
                          meeting.inicioAsistencia && meeting.finAsistencia ? (
                            <small>
                              Horario técnico: {meeting.inicioAsistencia.slice(11, 16)}–{meeting.finAsistencia.slice(11, 16)}
                              {meeting.modalidad === "HIBRIDA" ? " · presencial" : ""}
                            </small>
                          ) : meeting.modalidad === "HIBRIDA" ? (
                            <small className="status status-warning">Falta definir llegada y salida</small>
                          ) : null
                        ) : null}
                      </div>

                      <div className="encounter-v2-organizer-reference">
                        <span>Cuenta organizadora · referencia técnica</span>
                        <strong>{meeting.organizerAccount}</strong>
                        <small>No es necesario iniciar sesión con esta cuenta.</small>
                      </div>
                    </aside>
                  </div>

                  <footer className="encounter-card-actions encounter-card-actions-v2">
                    <div className="encounter-card-secondary-actions">
                      {meeting.editable ? (
                        <button className="secondary-action" disabled={busy !== null} onClick={() => setEditingId(meeting.id)} type="button">
                          <Pencil size={16} />Editar fecha
                        </button>
                      ) : null}
                      {canManageOperationalOverrides ? (
                        <>
                          <button
                            className="secondary-action"
                            disabled={busy !== null}
                            onClick={() => setOperationalEditor({ id: meeting.id, type: "MODALIDAD" })}
                            type="button"
                          >
                            <Pencil size={16} />Cambiar modalidad
                          </button>
                          {meeting.temporalidad !== "PASADO" ? (
                            <button
                              className="secondary-action"
                              disabled={busy !== null}
                              onClick={() => setOperationalEditor({ id: meeting.id, type: "ASISTENCIA" })}
                              type="button"
                            >
                              <CalendarClock size={16} />Horario asistente
                            </button>
                          ) : null}
                        </>
                      ) : null}
                      {canManageOperationalOverrides ? (
                        <a className="secondary-action" href={`/monitoreo/gestionar/${meeting.id}`}>
                          <UserRoundPlus size={16} />Gestionar monitoreo
                        </a>
                      ) : null}
                      {meeting.requiereAsistenciaTecnica ? (
                        <button className="secondary-action" disabled={!meeting.puedeCambiarAsistencia || busy !== null} onClick={() => changeAssistance(meeting.id, false)} type="button">
                          <UserRoundMinus size={16} />Cancelar asistencia
                        </button>
                      ) : !canManageOperationalOverrides ? (
                        <button className="secondary-action" disabled={!meeting.puedeCambiarAsistencia || busy !== null} onClick={() => changeAssistance(meeting.id, true)} type="button">
                          <UserRoundPlus size={16} />Pedir asistencia
                        </button>
                      ) : null}
                      {(() => {
                        const plan = planEliminacion(meeting);
                        return (
                          <button
                            className="icon-button danger-action"
                            disabled={!plan.habilitado}
                            onClick={() => remove(meeting.id)}
                            title={plan.motivo ?? "Eliminar encuentro"}
                            type="button"
                          >
                            <Trash2 size={17} /><span className="sr-only">Eliminar encuentro</span>
                          </button>
                        );
                      })()}
                    </div>
                  </footer>

                  {operationalEditor?.id === meeting.id ? (
                    <div className="encounter-editor">
                      <div className="encounter-editor-heading">
                        <div>
                          <strong>{operationalEditor.type === "MODALIDAD" ? "Modalidad de este encuentro" : "Horario de monitoreo"}</strong>
                          <small>
                            {operationalEditor.type === "MODALIDAD"
                              ? "Este cambio afecta únicamente esta fecha."
                              : "Indicá la hora exacta de llegada y salida para esta fecha."}
                          </small>
                        </div>
                        <button className="icon-button" onClick={() => setOperationalEditor(null)} title="Cerrar" type="button">
                          <X size={17} /><span className="sr-only">Cerrar</span>
                        </button>
                      </div>

                      {operationalEditor.type === "MODALIDAD" ? (
                        <form className="encounter-edit-form" action={(formData) => changeModality(meeting.id, formData)}>
                          <label className="field">
                            <span>Modalidad</span>
                            <select name="modalidad" defaultValue={meeting.modalidad} disabled={busy !== null}>
                              <option value="VIRTUAL">Virtual</option>
                              <option value="HIBRIDA">Híbrida / presencial</option>
                            </select>
                          </label>
                          <button className="primary-action" disabled={busy !== null} type="submit">
                            {busy === meeting.id ? <LoaderCircle className="button-spinner" size={16} /> : <Save size={16} />}
                            Guardar solo esta reunión
                          </button>
                          {meeting.modalidadPersonalizada ? (
                            <button className="secondary-action" disabled={busy !== null} onClick={() => resetModality(meeting.id)} type="button">
                              Restablecer modalidad de la serie
                            </button>
                          ) : null}
                        </form>
                      ) : (
                        <form className="encounter-edit-form" action={(formData) => changeAssistanceSchedule(meeting.id, formData)}>
                          <input name="fecha" type="hidden" value={meeting.inicio.slice(0, 10)} />
                          <label className="field">
                            <span>Hora de llegada</span>
                            <input
                              name="horaAsistenciaInicio"
                              type="time"
                              defaultValue={meeting.inicioAsistencia?.slice(11, 16) ?? meeting.inicio.slice(11, 16)}
                              disabled={busy !== null}
                              required
                            />
                          </label>
                          <label className="field">
                            <span>Hora de salida</span>
                            <input
                              name="horaAsistenciaFin"
                              type="time"
                              defaultValue={meeting.finAsistencia?.slice(11, 16) ?? meeting.fin.slice(11, 16)}
                              disabled={busy !== null}
                              required
                            />
                          </label>
                          <button className="primary-action" disabled={busy !== null} type="submit">
                            {busy === meeting.id ? <LoaderCircle className="button-spinner" size={16} /> : <Save size={16} />}
                            Guardar solo esta reunión
                          </button>
                          {meeting.horarioAsistenciaPersonalizado && meeting.horarioAsistenciaBaseDisponible ? (
                            <button
                              className="secondary-action"
                              disabled={busy !== null}
                              onClick={() => resetAssistanceSchedule(meeting.id)}
                              type="button"
                            >
                              Restablecer horario de la serie
                            </button>
                          ) : null}
                          <small>
                            {meeting.temporalidad === "PASADO"
                              ? "Corrección histórica: no modifica el evento de Google Calendar."
                              : `La reunión/Meet sigue siendo ${meeting.inicio.slice(11, 16)}–${meeting.fin.slice(11, 16)}.`}
                          </small>
                        </form>
                      )}
                    </div>
                  ) : null}
                </>
              ) : (
                <div className="encounter-editor">
                  <div className="encounter-editor-heading">
                    <div><strong>Editar encuentro</strong><small>Modificá fecha, horario o descripción.</small></div>
                    <button className="icon-button" onClick={() => setEditingId(null)} title="Cerrar edición" type="button">
                      <X size={17} /><span className="sr-only">Cerrar edición</span>
                    </button>
                  </div>
                  <form className="encounter-edit-form" action={(formData) => edit(meeting.id, formData)}>
                    <label className="field"><span>Fecha</span><input name="fecha" type="date" defaultValue={meeting.inicio.slice(0, 10)} disabled={!meeting.editable || busy !== null} required /></label>
                    <label className="field"><span>Hora de inicio</span><input name="horaInicio" type="time" defaultValue={meeting.inicio.slice(11, 16)} disabled={!meeting.editable || busy !== null} required /></label>
                    <label className="field"><span>Hora de fin</span><input name="horaFin" type="time" defaultValue={meeting.fin.slice(11, 16)} disabled={!meeting.editable || busy !== null} required /></label>
                    <button className="primary-action" disabled={!meeting.editable || busy !== null} type="submit">
                      {busy === meeting.id ? <LoaderCircle className="button-spinner" size={16} /> : <Save size={16} />}Guardar
                    </button>
                    <label className="field encounter-description-field"><span>Descripción del encuentro</span><textarea name="descripcion" defaultValue={meeting.descripcion ?? ""} disabled={!meeting.editable || busy !== null} placeholder="Tema, docente o indicaciones específicas" rows={3} /></label>
                  </form>
                </div>
              )}
              </div>
            </article>
          );
        })}
      </div>

      <details
        className="content-section add-encounter-section add-encounter-v2"
        id="agregar-encuentro"
        open={addingOpen}
        onToggle={(event) => setAddingOpen(event.currentTarget.open)}
        ref={addSectionRef}
      >
        <summary>
          <CalendarPlus size={18} aria-hidden="true" />
          <div><strong>Agregar otro encuentro</strong><small>Creá una nueva fecha dentro de esta serie.</small></div>
          <span>+</span>
        </summary>
        <form className="encounter-add-form" action={add}>
          <label className="field"><span>Fecha</span><input name="fecha" type="date" required /></label>
          <label className="field"><span>Hora de inicio</span><input name="horaInicio" type="time" required /></label>
          <label className="field"><span>Hora de fin</span><input name="horaFin" type="time" required /></label>
          <label className="field"><span>Llegada asistente (si corresponde)</span><input name="horaAsistenciaInicio" type="time" /></label>
          <label className="field"><span>Salida asistente (si corresponde)</span><input name="horaAsistenciaFin" type="time" /></label>
          <label className="check-field encounter-add-check"><input name="requiereAsistenciaTecnica" type="checkbox" /><span>Monitoreo</span></label>
          <label className="check-field encounter-add-check"><input name="requiereGrabacion" type="checkbox" /><span>Debe grabarse</span></label>
          <button className="primary-action" disabled={busy !== null} type="submit"><CalendarPlus size={17} />Agregar</button>
          <label className="field encounter-add-description"><span>Descripción del encuentro (opcional)</span><textarea name="descripcion" placeholder="Tema, docente o indicaciones específicas" rows={2} /></label>
        </form>
      </details>

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
    </section>
  );
}

function assistanceLabel(meeting: Encounter): Readonly<{ title: string; detail?: string }> {
  if (meeting.asistenteTecnico) {
    return { title: meeting.asistenteTecnico, detail: meeting.cohostsConfirmados ? "Cohost técnico verificado en Google." : "Monitoreo asignado; permisos Meet pendientes de verificar." };
  }
  if (meeting.requiereAsistenciaTecnica) {
    return {
      title: "Pendiente de asignación",
      detail: meeting.postulantes > 0
        ? `${meeting.postulantes} ${meeting.postulantes === 1 ? "postulación disponible" : "postulaciones disponibles"}`
        : "Todavía no hay postulaciones."
    };
  }
  return { title: "No requiere" };
}

function temporalLabel(temporalidad: Encounter["temporalidad"]): string {
  if (temporalidad === "PASADO") return "Pasado";
  if (temporalidad === "EN_CURSO") return "En curso";
  return "Futuro";
}

function localMontevideoToIso(formData: FormData, timeField: string): string {
  return `${String(formData.get("fecha"))}T${String(formData.get(timeField))}:00-03:00`;
}
