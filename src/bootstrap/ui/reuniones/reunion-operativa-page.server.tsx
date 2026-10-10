import {
  Activity,
  AlertTriangle,
  ArrowLeft,
  CheckCircle2,
  Clock3,
  Radio,
  Video
} from "lucide-react";
import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { auth } from "@/auth";
import { RefreshButton } from "@/src/components/refresh-button";
import { MeetingScheduleTimes } from "@/src/components/meeting-schedule-times";
import { AdminRetryMeetAction } from "@/src/components/admin-attention-actions";
import { OperationalIncidentForm } from "@/src/components/operational-incident-form";
import { OperationalAutoRefresh } from "@/src/components/operational-auto-refresh";
import { OperationalAssistanceClosureForm } from "@/src/components/operational-assistance-closure-form";
import { AssistantSelfUnassignButton } from "@/src/modules/asistencia/presentation/components/assistant-self-unassign-button";
import { resolveSessionActor } from "@/src/lib/auth/session-actor.adapter";
import { db } from "@/src/lib/db";
import { formatDate, formatTime } from "@/src/lib/ui/format";
import { obtenerReunionOperativa } from "@/src/bootstrap/reunion-operativa.server";

export default async function ReunionOperativaPage({
  params
}: Readonly<{ params: Promise<{ instanciaId: string }> }>) {
  const session = await auth();
  if (!session?.user) redirect("/acceso");

  const actor = await resolveSessionActor(db, {
    id: session.user.id,
    email: session.user.email
  });
  if (!actor?.activo) redirect("/acceso");

  const { instanciaId } = await params;
  const result = await obtenerReunionOperativa(
    { id: actor.id, rol: actor.rol },
    instanciaId
  );
  if (result.estado !== "OK") notFound();

  const reunion = result.reunion;
  const active = reunion.conferencia.participantesActivos;
  const backHref = actor.rol === "ASISTENTE_TECNICO" ? "/mi-agenda" : "/";
  const backLabel = actor.rol === "ASISTENTE_TECNICO" ? "Volver a mi agenda" : "Volver al dashboard";
  const canSelfUnassign =
    actor.rol === "ASISTENTE_TECNICO"
    && Boolean(reunion.asistencia.asignacionId)
    && reunion.asistencia.inicioAt.getTime() > reunion.actualizadoAt.getTime();

  return (
    <div className="meeting-detail-v2 operational-console">
      <div className="operational-toolbar">
        <Link className="meeting-detail-back" href={backHref}>
          <ArrowLeft size={15} aria-hidden="true" />
          {backLabel}
        </Link>
        <div className="operational-refresh">
          <OperationalAutoRefresh enabled={reunion.estado === "ESPERANDO_INICIO" || reunion.estado === "EN_CURSO"} />
          <RefreshButton />
        </div>
      </div>

      <section className="operational-hero">
        <div className="operational-hero-copy">
          <div className="operational-hero-topline">
            <p className="page-eyebrow">{reunion.programa}</p>
            <span className={`status ${statusClass(reunion.estado)}`}>
              {estadoLabel(reunion.estado)}
            </span>
          </div>
          <h1>{reunion.titulo}</h1>
          <div className="operational-hero-meta">
            <span>{reunion.docente}</span>
            <span>{formatDate(reunion.inicioProgramadoAt)}</span>
            <span>Encuentro: {formatTime(reunion.inicioProgramadoAt)}–{formatTime(reunion.finProgramadoAt)}</span>
            <span>{reunion.modalidad === "HIBRIDA" ? "Híbrida" : "Virtual"}</span>
          </div>
          <MeetingScheduleTimes startsAt={reunion.inicioProgramadoAt} endsAt={reunion.finProgramadoAt} requiresAssistance={reunion.asistencia.requerida} modality={reunion.modalidad} assistanceStartsAt={reunion.asistencia.inicioAt} assistanceEndsAt={reunion.asistencia.finAt} viewerIsAssistant={actor.rol === "ASISTENTE_TECNICO"} compact />
          {reunion.asistencia.asistente ? <p className="operational-assistance-time">Asistente asignado: {reunion.asistencia.asistente}</p> : null}
        </div>

        <div className="operational-hero-actions">
          {reunion.meet.joinUrl ? (
            <a className="primary-action operational-meet-action" href={reunion.meet.joinUrl} target="_blank" rel="noreferrer">
              <Video size={16} aria-hidden="true" />
              Entrar a Meet
            </a>
          ) : (
            <span className="status status-warning">Meet pendiente</span>
          )}
          {actor.rol !== "ASISTENTE_TECNICO" ? (
            <Link className="secondary-action" href={`/reuniones/${reunion.solicitudId}`}>
              Ficha completa
            </Link>
          ) : null}
          {canSelfUnassign && reunion.asistencia.asignacionId ? (
            <div className="operational-self-unassign">
              <AssistantSelfUnassignButton
                assignmentId={reunion.asistencia.asignacionId}
                title={reunion.titulo}
              />
            </div>
          ) : null}
        </div>
      </section>

      <section className="meeting-detail-summary operational-summary" aria-label="Estado operativo">
        <article>
          <Activity size={18} aria-hidden="true" />
          <div>
            <span>Estado real</span>
            <strong>{estadoLabel(reunion.estado)}</strong>
            <small>{disponibilidadLabel(reunion.conferencia.disponibilidad)}</small>
          </div>
        </article>
        <article>
          <Radio size={18} aria-hidden="true" />
          <div>
            <span>Participantes</span>
            <strong>{active.length}</strong>
            <small>
              {reunion.conferencia.inicioRealAt
                ? `Meet inició ${formatTime(reunion.conferencia.inicioRealAt)}`
                : "Sin conferencia activa"}
            </small>
          </div>
        </article>
        <article>
          <Video size={18} aria-hidden="true" />
          <div>
            <span>Grabación</span>
            <strong>{grabacionLabel(reunion.grabacion.estado)}</strong>
            <small>{reunion.requiereGrabacion ? "Requerida" : "No requerida"}</small>
          </div>
        </article>
        <article>
          <CheckCircle2 size={18} aria-hidden="true" />
          <div>
            <span>Cohosts</span>
            <strong>{reunion.cohosts.total === 0 ? "Sin cohosts" : reunion.cohosts.confirmados ? "Confirmados" : "Pendientes"}</strong>
            <small>{reunion.cohosts.total} configurados</small>
          </div>
        </article>
      </section>

      <section className="content-section operational-meet-card">
        <div className="section-heading">
          <div>
            <h2>Google Meet</h2>
            <p>Acceso e información necesaria para operar el encuentro.</p>
          </div>
        </div>

        <dl className="operational-facts">
          <div>
            <dt>Código</dt>
            <dd>{reunion.meet.codigo ?? "Pendiente"}</dd>
          </div>
          <div className="is-wide">
            <dt>Organizador</dt>
            <dd>{reunion.meet.organizador ?? "Pendiente"}</dd>
          </div>
          <div>
            <dt>Integración</dt>
            <dd>{reunion.meet.estadoIntegracion ?? "Sin evento"}</dd>
          </div>
          <div>
            <dt>Operación pendiente</dt>
            <dd>{reunion.meet.operacionPendiente ?? "Ninguna"}</dd>
          </div>
          <div className="is-wide">
            <dt>Asistencia técnica</dt>
            <dd>{reunion.asistencia.asistente ?? (reunion.asistencia.requerida ? "Pendiente" : "No requiere")}</dd>
            {reunion.asistencia.requerida ? (
              <small>Llegada: {formatTime(reunion.asistencia.inicioAt)} · Salida: {formatTime(reunion.asistencia.finAt)}</small>
            ) : null}
          </div>
        </dl>

        {actor.rol === "ADMINISTRACION" && reunion.meet.eventoProveedorId ? (
          <div className="operational-admin-action">
            <AdminRetryMeetAction
              eventoProveedorId={reunion.meet.eventoProveedorId}
              label={repairLabel(reunion.meet.operacionPendiente, Boolean(reunion.meet.joinUrl))}
              operacion={reunion.meet.operacionPendiente ?? (reunion.meet.joinUrl ? "CONFIGURAR_MEET" : "PROVISIONAR")}
            />
          </div>
        ) : null}

        {reunion.meet.errorIntegracion ? (
          <p className="status-warning-text operational-warning">
            <AlertTriangle size={15} aria-hidden="true" /> {reunion.meet.errorIntegracion}
          </p>
        ) : null}
        {reunion.conferencia.error ? (
          <p className="status-warning-text operational-warning">
            <AlertTriangle size={15} aria-hidden="true" /> No se pudo actualizar Meet: {reunion.conferencia.error}
          </p>
        ) : null}
      </section>

      <details
        className="content-section operational-disclosure"
        open={active.length > 0 || reunion.estado === "EN_CURSO"}
      >
        <summary>
          <div>
            <h2>Participantes activos</h2>
            <p>Datos confirmados por Google Meet al actualizar.</p>
          </div>
          <span className="badge-tag">{active.length}</span>
        </summary>
        <div className="operational-disclosure-content">
          {active.length === 0 ? (
            <p className="operational-empty-inline">
              <Clock3 size={18} aria-hidden="true" />
              No hay participantes activos confirmados.
            </p>
          ) : (
            <ul className="operational-participant-list">
              {active.map((participant, index) => (
                <li key={participant.user ?? `${participant.nombre}-${index}`}>
                  <strong>{participant.nombre}</strong>
                  <span>{tipoParticipanteLabel(participant.tipo)}</span>
                </li>
              ))}
            </ul>
          )}
        </div>
      </details>

      <details
        className="content-section operational-disclosure"
        open={reunion.incidencias.length > 0}
      >
        <summary>
          <div>
            <h2>Incidencias</h2>
            <p>Problemas operativos registrados para este encuentro.</p>
          </div>
          <span className="badge-tag">
            {reunion.incidencias.filter(({ estado }) => estado === "ABIERTA" || estado === "EN_ANALISIS").length}
          </span>
        </summary>
        <div className="operational-disclosure-content">
          {reunion.incidencias.length === 0 ? (
            <p className="operational-empty-inline">
              <CheckCircle2 size={18} aria-hidden="true" />
              No hay incidencias registradas.
            </p>
          ) : (
            <ul className="operational-incident-list">
              {reunion.incidencias.map((incidencia) => (
                <li key={incidencia.id}>
                  <div>
                    <strong>{incidenciaTipoLabel(incidencia.tipo)}</strong>
                    <span>{incidencia.estado.replaceAll("_", " ").toLowerCase()} · {incidencia.severidad.toLowerCase()}</span>
                  </div>
                  <p>{incidencia.descripcion}</p>
                  <small>{formatDate(incidencia.createdAt)} · {formatTime(incidencia.createdAt)}</small>
                </li>
              ))}
            </ul>
          )}
        </div>
      </details>

      <OperationalIncidentForm instanciaId={reunion.id} />

      {actor.rol === "ASISTENTE_TECNICO"
        && reunion.asistencia.asignacionId
        && (reunion.estado === "FINALIZADA" || reunion.estado === "NO_INICIADA") ? (
        <OperationalAssistanceClosureForm
          asignacionId={reunion.asistencia.asignacionId}
          inicioProgramado={reunion.asistencia.inicioAt.toISOString()}
          finProgramado={reunion.asistencia.finAt.toISOString()}
          cierreConfirmado={reunion.asistencia.cierreConfirmado}
        />
      ) : null}

      <section className="content-section operational-artifacts">
        <div className="section-heading">
          <div>
            <h2>Artefactos</h2>
            <p>Grabaciones y archivos sincronizados con Google.</p>
          </div>
        </div>
        <div className="operational-artifacts-grid">
          <div><strong>{reunion.artefactos.grabaciones}</strong><span>Grabaciones</span></div>
          <div><strong>{reunion.artefactos.transcripciones}</strong><span>Transcripciones</span></div>
          <div><strong>{reunion.artefactos.notas}</strong><span>Notas</span></div>
        </div>
        {reunion.grabacion.url ? (
          <a className="secondary-action operational-recording-link" href={reunion.grabacion.url} target="_blank" rel="noreferrer">
            <Video size={16} aria-hidden="true" />
            Ver grabación
          </a>
        ) : null}
        <p className="operational-updated">Actualizado: {formatTime(reunion.actualizadoAt)}</p>
      </section>
    </div>
  );
}

function statusClass(estado: string): string {
  if (estado === "EN_CURSO" || estado === "FINALIZADA") return "status-ok";
  if (estado === "ESPERANDO_INICIO") return "status-warning";
  if (estado === "NO_INICIADA") return "status-error";
  return "status-neutral";
}

function estadoLabel(estado: string): string {
  if (estado === "ESPERANDO_INICIO") return "Esperando inicio";
  if (estado === "EN_CURSO") return "En curso";
  if (estado === "FINALIZADA") return "Finalizada";
  if (estado === "NO_INICIADA") return "No iniciada";
  return "Programada";
}

function grabacionLabel(estado: string): string {
  if (estado === "NO_REQUERIDA") return "No requerida";
  if (estado === "PROCESANDO") return "Procesando";
  if (estado === "DISPONIBLE") return "Disponible";
  if (estado === "NO_REALIZADA") return "No realizada";
  return "Pendiente";
}

function disponibilidadLabel(estado: string): string {
  if (estado === "OK") return "Datos confirmados por Google Meet";
  if (estado === "SIN_CONFERENCIA") return "Todavía no existe una conferencia real";
  if (estado === "SIN_CREDENCIALES") return "Google Workspace no está disponible";
  if (estado === "ERROR") return "La última consulta a Google falló";
  return "Meet aún no está configurado";
}

function tipoParticipanteLabel(tipo: string): string {
  if (tipo === "CUENTA_GOOGLE") return "Cuenta Google";
  if (tipo === "TELEFONO") return "Teléfono";
  return "Anónimo";
}


function repairLabel(
  operacion: "PROVISIONAR" | "REPROGRAMAR" | "CONFIGURAR_MEET" | "CANCELAR" | null,
  hasMeet: boolean
): string {
  if (operacion === "REPROGRAMAR") return "Reintentar reprogramación";
  if (operacion === "CONFIGURAR_MEET") return "Reintentar configuración de Meet";
  if (operacion === "CANCELAR") return "Reintentar cancelación en Calendar";
  if (operacion === "PROVISIONAR") return "Reintentar provisión de Meet";
  return hasMeet ? "Revisar configuración de Meet" : "Reintentar provisión de Meet";
}


function incidenciaTipoLabel(tipo: string): string {
  if (tipo === "DOCENTE_NO_INGRESA") return "Docente no ingresa";
  if (tipo === "AUDIO_VIDEO") return "Audio o video";
  if (tipo === "GRABACION") return "Grabación";
  if (tipo === "SALA_INCORRECTA") return "Sala incorrecta";
  if (tipo === "CONECTIVIDAD") return "Conectividad";
  return tipo === "OTRA" ? "Otra" : tipo.replaceAll("_", " ").toLowerCase();
}
