"use client";

import {
  CalendarClock,
  CheckCircle2,
  CircleAlert,
  Clock3,
  History,
  Megaphone,
  UserRoundCheck,
  UserRoundMinus,
  UserRoundX
} from "lucide-react";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { ConfirmacionCobertura, type ConfirmacionCoberturaDetalle } from "./confirmacion-cobertura";

type Assistant = Readonly<{ id: string; name: string; eligible: boolean }>;
type Meeting = Readonly<{
  id: string;
  requestId: string;
  past: boolean;
  cancelled: boolean;
  estado: string;
  requiereMonitoreo: boolean;
  modalidad: "VIRTUAL" | "HIBRIDA";
  inicio: string;
  fin: string;
  inicioMonitoreo: string | null;
  finMonitoreo: string | null;
  asignado: string | null;
}>;
type HistoricalRecord = Readonly<{
  id: string;
  estado: string;
  name: string;
  inicio: string;
  fin: string;
  minutos: number;
  monto: number;
  moneda: string;
  motivo: string;
  motivoRechazo: string | null;
}>;

function localDateTime(iso: string): string {
  return new Date(iso)
    .toLocaleString("sv-SE", {
      timeZone: "America/Montevideo",
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
      hour: "2-digit",
      minute: "2-digit",
      hour12: false
    })
    .replace(" ", "T");
}

function montevideoIso(value: string): string {
  // Uruguay usa UTC-03:00 sin DST; guardar instantes ISO sin depender del navegador.
  if (!/^\d{4}-\d\d-\d\dT\d\d:\d\d$/.test(value)) {
    throw new Error("Ingresá una fecha y una hora válidas.");
  }
  return new Date(`${value}:00-03:00`).toISOString();
}

export function GestionCoberturaPanel({
  meeting,
  assistants,
  historical,
  applicants = [],
  assignedId = null,
  assignmentId = null
}: Readonly<{
  meeting: Meeting;
  assistants: readonly Assistant[];
  historical: readonly HistoricalRecord[];
  applicants?: readonly Readonly<{ assistantId: string; comment: string | null; date: string }>[];
  assignedId?: string | null;
  assignmentId?: string | null;
}>) {
  const router = useRouter();
  const [assistantId, setAssistantId] = useState("");
  const [start, setStart] = useState(() => localDateTime(meeting.inicioMonitoreo ?? meeting.inicio));
  const [end, setEnd] = useState(() => localDateTime(meeting.finMonitoreo ?? meeting.fin));
  const [reason, setReason] = useState("");
  const [rejection, setRejection] = useState("");
  const [pending, setPending] = useState(false);
  const [notice, setNotice] = useState("");
  const [error, setError] = useState("");
  const [confirmacion, setConfirmacion] = useState<ConfirmacionCoberturaDetalle | null>(null);
  const canManage = !meeting.past && !meeting.cancelled && meeting.estado === "PROGRAMADA";
  const missingHours = meeting.modalidad === "HIBRIDA" && (!meeting.inicioMonitoreo || !meeting.finMonitoreo);
  const currentPending = historical.find((record) => record.estado === "PENDIENTE");
  const alreadyApproved = historical.find((record) => record.estado === "APROBADO");

  async function send(
    payload: Record<string, string | boolean>,
    successMessage: string,
    url = "/api/v1/asistencia/gestion-cobertura",
    method = "POST"
  ) {
    setPending(true);
    setError("");
    setNotice("");
    try {
      const response = await fetch(url, {
        method,
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload)
      });
      const result = await response.json().catch(() => ({}));
      if (!response.ok) {
        throw new Error(result.error ?? "No se pudo completar la operación.");
      }
      setNotice(result.warning ? `${successMessage} ${result.warning}` : successMessage);
      setAssistantId("");
      router.refresh();
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "No se pudo completar la operación.");
    } finally {
      setPending(false);
    }
  }

  function assign(id: string) {
    if (!canManage || missingHours || pending || id === assignedId) {
      return;
    }
    const person = assistants.find((item) => item.id === id && item.eligible);
    if (!person) {
      return;
    }
    if (meeting.asignado) {
      setConfirmacion({ tipo: "reasignacion", anterior: meeting.asignado, nombre: person.name, asistenteId: id });
      return;
    }
    sendAssignment(id);
  }

  function sendAssignment(id: string) {
    void send(
      { accion: "ASIGNAR_DIRECTO", instanciaSalaId: meeting.id, asistenteTecnicoId: id },
      "Cobertura guardada. No se envió una convocatoria general."
    );
  }

  function submitFuture(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    assign(assistantId);
  }

  function confirmAction(detail: ConfirmacionCoberturaDetalle) {
    setConfirmacion(null);
    switch (detail.tipo) {
      case "convocatoria":
        void send({ accion: "CONVOCAR", instanciaSalaId: meeting.id }, "La convocatoria quedó registrada.");
        break;
      case "desasignacion":
        void send(
          { asignacionId: detail.asignacionId },
          "Asistente desasignado. El encuentro continúa pendiente de monitoreo.",
          "/api/v1/asistencia/asignaciones/desvincular"
        );
        break;
      case "reasignacion":
        sendAssignment(detail.asistenteId);
        break;
      case "cancelar":
        void send(
          { accion: "CAMBIAR_ASISTENCIA", requiereAsistenciaTecnica: false },
          "El encuentro ya no requiere monitoreo.",
          `/api/v1/reuniones/${meeting.requestId}/encuentros/${meeting.id}`,
          "PATCH"
        );
        break;
      case "aprobacion":
        void send(
          { accion: "APROBAR_RETROACTIVO", registroId: detail.registroId },
          "Registro aprobado y habilitado para liquidaciones."
        );
        break;
    }
  }

  function submitHistorical(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!assistantId) {
      return;
    }
    let inicioRealAt: string;
    let finRealAt: string;
    try {
      inicioRealAt = montevideoIso(start);
      finRealAt = montevideoIso(end);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Las fechas no son válidas.");
      return;
    }
    void send(
      {
        accion: "REGISTRAR_RETROACTIVO",
        instanciaSalaId: meeting.id,
        asistenteTecnicoId: assistantId,
        inicioRealAt,
        finRealAt,
        motivo: reason
      },
      "Registro histórico guardado. No afecta liquidaciones hasta aprobarse."
    );
  }

  return (
    <div className="monitoring-workflow-main">
      {meeting.cancelled ? (
        <div className="monitoring-workflow-banner is-warning" role="status">
          <CircleAlert size={20} aria-hidden="true" />
          Este encuentro fue cancelado o no se realizó. No se pueden agregar asignaciones.
        </div>
      ) : null}
      <section className="monitoring-workflow-surface" aria-labelledby="coverage-status-title">
        <div className="monitoring-workflow-section-heading">
          <h2 id="coverage-status-title">Estado de cobertura</h2>
        </div>
        <div className="monitoring-workflow-body">
          {meeting.asignado ? (
            <div className="monitoring-workflow-banner" role="status">
              <CheckCircle2 size={20} aria-hidden="true" />
              <div className="monitoring-status-copy">
                <small>Persona asignada</small>
                <strong>{meeting.asignado}</strong>
              </div>
            </div>
          ) : (
            <div className="monitoring-workflow-banner is-warning" role="status">
              <CircleAlert size={20} aria-hidden="true" />
              <div className="monitoring-status-copy">
                <strong>{meeting.requiereMonitoreo ? "Pendiente de monitoreo" : "No requiere monitoreo"}</strong>
                <small>{meeting.requiereMonitoreo ? "Todavía no hay una persona asignada." : "Podés solicitar cobertura si es necesario."}</small>
              </div>
            </div>
          )}
          {canManage && assignmentId && meeting.asignado ? (
            <button
              className="monitoring-danger-action"
              type="button"
              disabled={pending}
              onClick={() => setConfirmacion({ tipo: "desasignacion", nombre: meeting.asignado!, asignacionId: assignmentId })}
            >
              <UserRoundMinus size={17} aria-hidden="true" /> Desasignar asistente
            </button>
          ) : null}
          {canManage && assignmentId ? (
            <p className="monitoring-workflow-help">La desasignación mantiene el monitoreo pendiente, sin cancelar el encuentro ni convocar al equipo.</p>
          ) : null}
        </div>
      </section>
      {notice ? <p className="monitoring-workflow-feedback" role="status">{notice}</p> : null}
      {error ? <p className="monitoring-workflow-error" role="alert">{error}</p> : null}

      <section className="monitoring-workflow-surface" aria-labelledby="applicants-title">
        <div className="monitoring-workflow-section-heading">
          <div>
            <h2 id="applicants-title">Personas postuladas ({applicants.length})</h2>
            <p>Postulaciones activas para este encuentro.</p>
          </div>
        </div>
        <div className="monitoring-workflow-body">
          {applicants.length === 0 ? (
            <p className="monitoring-workflow-help">No hay postulaciones activas.</p>
          ) : (
            <ul className="monitoring-applicants">
              {applicants.map((application) => {
                const assistant = assistants.find(({ id }) => id === application.assistantId);
                const assigned = assignedId === application.assistantId;
                return (
                  <li key={application.assistantId}>
                    <div>
                      <strong>{assistant?.name ?? "Persona no disponible"}</strong>
                      <small>Postulación: {localDateTime(application.date).replace("T", " ")}</small>
                      {application.comment ? <p>{application.comment}</p> : null}
                      {assigned ? <small>Ya asignada</small> : null}
                      {!assistant?.eligible ? <small>No habilitada para asignación</small> : null}
                    </div>
                    {canManage && !assigned ? (
                      <button
                        className="secondary-action"
                        type="button"
                        disabled={pending || missingHours || !assistant?.eligible}
                        onClick={() => assign(application.assistantId)}
                      >
                        {meeting.asignado ? "Reasignar a esta persona" : "Asignar a esta persona"}
                      </button>
                    ) : null}
                  </li>
                );
              })}
            </ul>
          )}
        </div>
      </section>
      {meeting.past ? (
        <section className="monitoring-workflow-surface" aria-labelledby="historical-title">
          <div className="monitoring-workflow-section-heading">
            <span className="monitoring-workflow-icon">
              <History size={21} aria-hidden="true" />
            </span>
            <div>
              <h2 id="historical-title">Registro retroactivo</h2>
              <p>Documentá quién realizó el monitoreo y el horario realmente trabajado.</p>
            </div>
          </div>
          <div className="monitoring-workflow-body">
            <p className="monitoring-workflow-help">
              Las horas y el importe quedan pendientes de aprobación. No se envían convocatorias ni se
              modifican cohosts o calendarios históricos.
            </p>
            {currentPending ? (
              <div className="monitoring-historical-review">
                <span className="status status-warning">Pendiente de aprobación</span>
                <strong>{currentPending.name}</strong>
                <p>
                  <Clock3 size={16} aria-hidden="true" />
                  {localDateTime(currentPending.inicio).replace("T", " ")} –{" "}
                  {localDateTime(currentPending.fin).replace("T", " ")}
                </p>
                <p>
                  {currentPending.minutos} minutos · {currentPending.moneda}{" "}
                  {currentPending.monto.toLocaleString("es-UY", {
                    minimumFractionDigits: 2,
                    maximumFractionDigits: 2
                  })}{" "}
                  estimados
                </p>
                <p>
                  <strong>Motivo:</strong> {currentPending.motivo}
                </p>
                <div className="monitoring-review-actions">
                  <button
                    className="primary-action"
                    type="button"
                    disabled={pending || meeting.cancelled}
                    onClick={() =>
                      setConfirmacion({
                        tipo: "aprobacion",
                        registroId: currentPending.id,
                        nombre: currentPending.name,
                        minutos: currentPending.minutos,
                        moneda: currentPending.moneda,
                        importe: currentPending.monto.toLocaleString("es-UY", {
                          minimumFractionDigits: 2,
                          maximumFractionDigits: 2
                        })
                      })
                    }
                  >
                    <CheckCircle2 size={16} /> Aprobar registro
                  </button>
                  <div className="monitoring-rejection">
                    <label htmlFor="monitoring-rejection-reason">Motivo de rechazo</label>
                    <input
                      id="monitoring-rejection-reason"
                      value={rejection}
                      onChange={(e) => setRejection(e.target.value)}
                      placeholder="Indicar motivo…"
                      minLength={5}
                      maxLength={1000}
                    />
                    <button
                      className="secondary-action"
                      type="button"
                      disabled={pending || rejection.trim().length < 5}
                      onClick={() =>
                        void send(
                          {
                            accion: "RECHAZAR_RETROACTIVO",
                            registroId: currentPending.id,
                            motivo: rejection
                          },
                          "Registro rechazado."
                        )
                      }
                    >
                      Rechazar
                    </button>
                  </div>
                </div>
              </div>
            ) : alreadyApproved ? (
              <div className="monitoring-workflow-banner">
                <CheckCircle2 size={19} aria-hidden="true" />
                Registro aprobado para {alreadyApproved.name}: {alreadyApproved.minutos} minutos,{" "}
                {alreadyApproved.moneda}{" "}
                {alreadyApproved.monto.toLocaleString("es-UY", { minimumFractionDigits: 2 })}.
              </div>
            ) : meeting.cancelled || meeting.asignado ? null : (
              <form className="monitoring-workflow-form" onSubmit={submitHistorical}>
                <label htmlFor="historical-assistant">Persona que realizó el monitoreo</label>
                <select
                  id="historical-assistant"
                  required
                  value={assistantId}
                  onChange={(e) => setAssistantId(e.target.value)}
                  disabled={pending}
                >
                  <option value="">Seleccionar asistente…</option>
                  {assistants.map((assistant) => (
                    <option key={assistant.id} value={assistant.id}>
                      {assistant.name}
                      {assistant.eligible ? "" : " · actualmente inactivo"}
                    </option>
                  ))}
                </select>
                <div className="monitoring-workflow-time-grid">
                  <div>
                    <label htmlFor="historical-start">Hora real de llegada</label>
                    <input
                      id="historical-start"
                      type="datetime-local"
                      required
                      value={start}
                      onChange={(e) => setStart(e.target.value)}
                      disabled={pending}
                    />
                  </div>
                  <div>
                    <label htmlFor="historical-end">Hora real de salida</label>
                    <input
                      id="historical-end"
                      type="datetime-local"
                      required
                      value={end}
                      onChange={(e) => setEnd(e.target.value)}
                      disabled={pending}
                    />
                  </div>
                </div>
                <label htmlFor="historical-reason">Motivo del registro posterior</label>
                <textarea
                  id="historical-reason"
                  rows={3}
                  required
                  minLength={10}
                  maxLength={1000}
                  value={reason}
                  onChange={(e) => setReason(e.target.value)}
                  disabled={pending}
                  placeholder="Ej.: se realizó el monitoreo pero no se registró la asignación antes del encuentro."
                />
                <button className="primary-action" type="submit" disabled={pending || !assistantId}>
                  {pending ? "Guardando…" : "Guardar pendiente de aprobación"}
                </button>
              </form>
            )}
            {historical.filter((record) => record.estado === "RECHAZADO").length ? (
              <details className="monitoring-workflow-rejections">
                <summary>
                  Ver registros rechazados (
                  {historical.filter((record) => record.estado === "RECHAZADO").length})
                </summary>
                {historical
                  .filter((record) => record.estado === "RECHAZADO")
                  .map((record) => (
                    <p key={record.id}>
                      <strong>{record.name}:</strong> {record.motivoRechazo ?? "Sin motivo"}
                    </p>
                  ))}
              </details>
            ) : null}
          </div>
        </section>
      ) : (
        <section className="monitoring-workflow-surface" aria-labelledby="future-title">
          <div className="monitoring-workflow-section-heading">
            <span className="monitoring-workflow-icon">
              <UserRoundCheck size={21} aria-hidden="true" />
            </span>
            <div>
              <h2 id="future-title">Cobertura del encuentro</h2>
              <p>
                {meeting.requiereMonitoreo
                  ? "Este encuentro ya requiere monitoreo."
                  : "El encuentro originalmente no requería monitoreo."}
              </p>
            </div>
          </div>
          <div className="monitoring-workflow-body">
            {canManage ? (
              <>
                <form className="monitoring-workflow-form monitoring-direct-form" onSubmit={submitFuture}>
                  <label htmlFor="future-assistant">{meeting.asignado ? "Reasignar a otra persona" : "Asignar asistente"}</label>
                  <select
                    id="future-assistant"
                    required
                    value={assistantId}
                    onChange={(e) => setAssistantId(e.target.value)}
                    disabled={pending || missingHours}
                  >
                    <option value="">Seleccionar persona…</option>
                    {assistants
                      .filter((assistant) => assistant.eligible && assistant.id !== assignedId)
                      .map((assistant) => (
                        <option key={assistant.id} value={assistant.id}>
                          {assistant.name}
                          {applicants.some((application) => application.assistantId === assistant.id) ? " · Postulada" : ""}
                        </option>
                      ))}
                  </select>
                  <button className="primary-action" type="submit" disabled={pending || !assistantId || missingHours}>
                    <UserRoundCheck size={17} aria-hidden="true" />
                    {meeting.asignado ? "Reasignar" : "Asignar directamente"}
                  </button>
                  <p className="monitoring-workflow-help">Se verifican conflictos de agenda antes de guardar. No se envía una convocatoria general.</p>
                </form>
                {missingHours ? (
                  <div className="monitoring-workflow-banner is-warning" role="status">
                    <CalendarClock size={20} aria-hidden="true" />
                    Definí llegada y salida desde la edición del encuentro híbrido antes de asignar o convocar.
                  </div>
                ) : null}
                {!meeting.asignado ? (
                  <div className="monitoring-secondary-options">
                    <button className="secondary-action" type="button" disabled={pending || missingHours} onClick={() => setConfirmacion({ tipo: "convocatoria" })}>
                      <Megaphone size={17} aria-hidden="true" /> Abrir convocatoria
                    </button>
                    <small>Notifica al equipo disponible para que pueda postularse.</small>
                    {meeting.requiereMonitoreo ? (
                      <button className="monitoring-danger-action" type="button" disabled={pending} onClick={() => setConfirmacion({ tipo: "cancelar" })}>
                        <UserRoundX size={17} aria-hidden="true" /> Quitar requisito de monitoreo
                      </button>
                    ) : null}
                  </div>
                ) : null}
              </>
            ) : (
              <p className="monitoring-workflow-help">Las asignaciones solo se modifican aquí en encuentros programados y no finalizados.</p>
            )}
          </div>
        </section>
      )}
      {confirmacion ? (
        <ConfirmacionCobertura
          detalle={confirmacion}
          onCerrar={() => setConfirmacion(null)}
          onConfirmar={() => confirmAction(confirmacion)}
        />
      ) : null}
    </div>
  );
}
