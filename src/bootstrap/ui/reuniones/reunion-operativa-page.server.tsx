import {
  Activity,
  AlertTriangle,
  ArrowLeft,
  CheckCircle2,
  Clock3,
  FileText,
  Lock,
  Radio,
  Split,
  Users,
  Video
} from "lucide-react";
import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { auth } from "@/auth";
import { RefreshButton } from "@/src/components/refresh-button";
import { leerAsistenciaZoomFicha } from "@/src/bootstrap/zoom-asistencia-lectura.server";
import {
  obtenerParticipantesZoomEnVivoHttp,
  type EstadoAsistenciaZoomEnVivo
} from "@/src/integrations/zoom/zoom-live-participants.client";
import { obtenerEstadoActualZoomHttp, obtenerZoomAccessToken } from "@/src/integrations/zoom/zoom-client";
import {
  consultarInscriptosZoom,
  elegirAmbitoInscriptos
} from "@/src/integrations/zoom/zoom-registrants.client";
import { leerEjecucionesZoomActuales } from "@/src/bootstrap/zoom-estado-actual.server";
import { resolverEstadoActualZoom } from "@/src/modules/reuniones/presentation/estado-actual-zoom";
import { obtenerCredencialesZoom } from "@/src/modules/configuracion/zoom-config.service";
import { descifrarConfiguracion } from "@/src/lib/config/encryption";
import { ReunionZoomOperativa } from "./reunion-zoom-operativa";
import { ReunionZoomHistorica, SECCIONES_FICHA_ZOOM } from "./reunion-zoom-historica";
import { leerActividadEncuentroZoom } from "@/src/bootstrap/zoom-actividad-lectura.server";
import { MeetingScheduleTimes } from "@/src/components/meeting-schedule-times";
import { AdminRetryMeetAction } from "@/src/components/admin-attention-actions";
import { OperationalIncidentForm } from "@/src/components/operational-incident-form";
import { OperationalAutoRefresh } from "@/src/components/operational-auto-refresh";
import { OperationalAssistanceClosureForm } from "@/src/components/operational-assistance-closure-form";
import {
  OperationalAttendeeDatabaseManager,
  OperationalRemoteControlPanel
} from "@/src/components/operational-remote-control";
import { AssistantSelfUnassignButton } from "@/src/modules/asistencia/presentation/components/assistant-self-unassign-button";
import { resolveSessionActor } from "@/src/lib/auth/session-actor.adapter";
import { db } from "@/src/lib/db";
import { formatDate, formatTime } from "@/src/lib/ui/format";
import { obtenerReunionOperativa } from "@/src/bootstrap/reunion-operativa.server";

export default async function ReunionOperativaPage({
  params,
  searchParams
}: Readonly<{
  params: Promise<{ instanciaId: string }>;
  searchParams?: Promise<{ seccion?: string; vista?: string }>;
}>) {
  const session = await auth();
  if (!session?.user) {
    redirect("/acceso");
  }

  const actor = await resolveSessionActor(db, {
    id: session.user.id,
    email: session.user.email
  });
  if (!actor?.activo) {
    redirect("/acceso");
  }

  const { instanciaId } = await params;
  const result = await obtenerReunionOperativa({ id: actor.id, rol: actor.rol }, instanciaId);
  if (result.estado !== "OK") {
    notFound();
  }

  const reunion = result.reunion;
  if (reunion.proveedorActivo === "ZOOM") {
    const ejecuciones = reunion.zoom.eventoProveedorId
      ? await leerEjecucionesZoomActuales(reunion.zoom.eventoProveedorId)
      : [];
    // Durante la ventana de clase (y si hay un inicio sin cierre) nunca se congela la consola
    // en la primera ejecución finalizada. Se comprueba la serie sin usar Dashboard.
    const { seccion, vista } = (await searchParams) ?? {};
    const ahora = reunion.actualizadoAt.getTime();
    const cercaDelHorario =
      ahora >= reunion.inicioProgramadoAt.getTime() - 60 * 60_000 &&
      ahora <= reunion.finProgramadoAt.getTime() + 60 * 60_000;
    const ultimo = resolverEstadoActualZoom(ejecuciones, null, null);
    const consultar =
      vista === "actual" ||
      cercaDelHorario ||
      ultimo.tipo === "INICIO_SIN_VERIFICAR" ||
      reunion.estado === "EN_CURSO";
    let api: Awaited<ReturnType<typeof obtenerEstadoActualZoomHttp>> | null = null;
    let cuentaApi: string | null = null;
    let token: string | null = null;
    if (reunion.zoom.id) {
      try {
        const credenciales = await obtenerCredencialesZoom(db, descifrarConfiguracion);
        if (credenciales.disponible) {
          cuentaApi = credenciales.accountId;
          token = await obtenerZoomAccessToken(credenciales);
          api = await obtenerEstadoActualZoomHttp(token, reunion.zoom.id);
        }
      } catch {
        // Un fallo de consulta nunca equivale a una reunión cerrada.
      }
    }
    const actual = resolverEstadoActualZoom(ejecuciones, api, cuentaApi);
    const mostrarOperativa =
      vista === "actual" ||
      cercaDelHorario ||
      actual.tipo === "ACTIVA" ||
      actual.tipo === "INICIO_SIN_VERIFICAR" ||
      (reunion.estado === "PROGRAMADA" && ahora < reunion.inicioProgramadoAt.getTime());
    if (!mostrarOperativa || vista === "historial") {
      const asistencia = await leerAsistenciaZoomFicha(reunion.id, { id: actor.id, rol: actor.rol });
      const actividad = reunion.zoom.eventoProveedorId
        ? await leerActividadEncuentroZoom(reunion.zoom.eventoProveedorId)
        : [];
      const inscriptosZoom = seccion === "inscripciones"
        ? await consultarInscriptosZoom({
            token,
            meetingId: reunion.zoom.id,
            habilitada: api?.configuracion.inscripcion ?? null,
            ambito: elegirAmbitoInscriptos(api?.tipoReunion, api?.ocurrencias, reunion.inicioProgramadoAt)
          })
        : undefined;
      return (
        <ReunionZoomHistorica
          reunion={reunion}
          rol={actor.rol}
          asistencia={asistencia}
          actividad={actividad}
          inscriptosZoom={inscriptosZoom}
          configuracion={api?.configuracion}
          seccion={SECCIONES_FICHA_ZOOM.find((s) => s === seccion) ?? "resumen"}
          ejecuciones={ejecuciones}
          estadoActual={consultar ? actual : undefined}
          mostrarRegresoEnVivo={mostrarOperativa}
        />
      );
    }
    let asistenciaEnVivo: EstadoAsistenciaZoomEnVivo = { estado: "NO_DISPONIBLE", motivo: "SIN_DATOS" };
    const activa = actual.tipo === "ACTIVA" || actual.tipo === "INICIO_SIN_VERIFICAR";
    const ejecucionActiva = activa ? actual.ejecucion : null;
    if (token && ejecucionActiva) {
      asistenciaEnVivo = await obtenerParticipantesZoomEnVivoHttp(token, ejecucionActiva.uuid);
    }
    const actividadEnVivo =
      reunion.zoom.eventoProveedorId && ejecucionActiva
        ? await leerActividadEncuentroZoom(reunion.zoom.eventoProveedorId, ejecucionActiva)
        : [];
    const inscriptosZoom = await consultarInscriptosZoom({
      token,
      meetingId: reunion.zoom.id,
      habilitada: api?.configuracion.inscripcion ?? null,
      ambito: elegirAmbitoInscriptos(api?.tipoReunion, api?.ocurrencias, reunion.inicioProgramadoAt)
    });
    let estado = reunion.estado;
    if (activa) {
      estado = "EN_CURSO";
    } else if (cercaDelHorario) {
      estado = "ESPERANDO_INICIO";
    }
    return (
      <ReunionZoomOperativa
        reunion={{ ...reunion, estado }}
        rol={actor.rol}
        salaEspera={api?.salaEspera ?? null}
        configuracion={api?.configuracion}
        inscriptosZoom={inscriptosZoom}
        asistenciaEnVivo={asistenciaEnVivo}
        actividad={actividadEnVivo}
        estadoActual={actual}
        actualizarAutomaticamente={consultar}
      />
    );
  }

  const active = reunion.conferencia.participantesActivos;
  const desconectados = reunion.conferencia.participantesDesconectados;
  const hostsYCohosts = reunion.conferencia.hostsYCohosts;
  const hostsConectados = hostsYCohosts.filter((h) => h.conectado);
  const backHref = actor.rol === "ASISTENTE_TECNICO" ? "/mi-agenda" : "/";
  const backLabel = actor.rol === "ASISTENTE_TECNICO" ? "Volver a mi agenda" : "Volver al dashboard";
  const canSelfUnassign =
    actor.rol === "ASISTENTE_TECNICO" &&
    Boolean(reunion.asistencia.asignacionId) &&
    reunion.asistencia.inicioAt.getTime() > reunion.actualizadoAt.getTime();

  const grabacionFaltanteEnCurso =
    reunion.estado === "EN_CURSO" &&
    reunion.requiereGrabacion &&
    !reunion.grabacion.grabandoEnVivo &&
    reunion.grabacion.estado !== "DISPONIBLE" &&
    reunion.grabacion.estado !== "PROCESANDO";

  return (
    <div className="meeting-detail-v2 operational-console">
      <div className="operational-toolbar">
        <Link className="meeting-detail-back" href={backHref}>
          <ArrowLeft size={15} aria-hidden="true" />
          {backLabel}
        </Link>
        <div className="operational-refresh">
          <OperationalAutoRefresh
            enabled={reunion.estado === "ESPERANDO_INICIO" || reunion.estado === "EN_CURSO"}
          />
          <RefreshButton />
        </div>
      </div>

      <section className="operational-hero">
        <div className="operational-hero-copy">
          <div className="operational-hero-topline">
            <p className="page-eyebrow">{reunion.programa}</p>
            <span className={`status ${statusClass(reunion.estado)}`}>{estadoLabel(reunion.estado)}</span>
            <span
              className={`operational-mini-pill ${reunion.requiereGrabacion ? "is-req-yes" : "is-req-no"}`}
              title="Define si la solicitud del encuentro exige grabación"
            >
              {reunion.requiereGrabacion ? "Solicitud: Grabación requerida" : "Solicitud: Sin grabación"}
            </span>
            {reunion.grabacion.grabandoEnVivo ? (
              <span className="operational-mini-pill is-live-rec">● Meet: Grabando en vivo</span>
            ) : grabacionFaltanteEnCurso ? (
              <span className="operational-mini-pill is-not-rec-warn">⚠ Meet: No se está grabando</span>
            ) : null}
            {reunion.transcripcion.transcribiendoEnVivo ? (
              <span className="operational-mini-pill is-live-rec">● Meet: Transcribiendo en vivo</span>
            ) : null}
            {reunion.conferencia.enGruposPequenos ? (
              <span className="status status-warning">
                <Split size={13} aria-hidden="true" /> Grupos pequeños (
                {reunion.conferencia.cantidadGruposPequenos})
              </span>
            ) : null}
          </div>
          <h1>{reunion.titulo}</h1>
          <div className="operational-hero-meta">
            <span>
              {reunion.docente}
              {reunion.docenteEmail ? ` (${reunion.docenteEmail})` : ""}
            </span>
            <span>{formatDate(reunion.inicioProgramadoAt)}</span>
            <span>
              Encuentro: {formatTime(reunion.inicioProgramadoAt)}–{formatTime(reunion.finProgramadoAt)}
            </span>
            <span>{reunion.modalidad === "HIBRIDA" ? "Híbrida" : "Virtual"}</span>
          </div>
          <MeetingScheduleTimes
            startsAt={reunion.inicioProgramadoAt}
            endsAt={reunion.finProgramadoAt}
            requiresAssistance={reunion.asistencia.requerida}
            modality={reunion.modalidad}
            assistanceStartsAt={reunion.asistencia.inicioAt}
            assistanceEndsAt={reunion.asistencia.finAt}
            viewerIsAssistant={actor.rol === "ASISTENTE_TECNICO"}
            compact
          />
          {reunion.asistencia.asistente ? (
            <p className="operational-assistance-time">
              Asistente asignado: {reunion.asistencia.asistente}
              {reunion.asistencia.asistenteEmail ? ` (${reunion.asistencia.asistenteEmail})` : ""}
            </p>
          ) : null}
        </div>

        <div className="operational-hero-actions">
          {reunion.meet.joinUrl ? (
            <a
              className="primary-action operational-meet-action"
              href={reunion.meet.joinUrl}
              target="_blank"
              rel="noreferrer"
            >
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

      {grabacionFaltanteEnCurso ? (
        <section className="operational-recording-banner" role="alert">
          <div>
            <AlertTriangle size={20} aria-hidden="true" />
            <div>
              <strong>Grabación requerida por solicitud, pero NO se está grabando en Google Meet</strong>
              <small>
                Que la grabación sea requerida no inicia la grabación automáticamente. Un host o cohost debe
                iniciar la grabación dentro de Google Meet.
              </small>
            </div>
          </div>
          {reunion.meet.joinUrl ? (
            <a className="secondary-action" href={reunion.meet.joinUrl} target="_blank" rel="noreferrer">
              <Video size={15} aria-hidden="true" />
              Abrir Meet para grabar
            </a>
          ) : null}
        </section>
      ) : null}

      <section className="meeting-detail-summary operational-summary" aria-label="Estado operativo">
        <article>
          <Activity size={18} aria-hidden="true" />
          <div>
            <span>Estado real</span>
            <strong>{estadoLabel(reunion.estado)}</strong>
            <small>
              {reunion.conferencia.enGruposPequenos
                ? `En grupos pequeños (${reunion.conferencia.cantidadGruposPequenos} sub-salas)`
                : disponibilidadLabel(reunion.conferencia.disponibilidad)}
            </small>
          </div>
        </article>
        <article>
          <Radio size={18} aria-hidden="true" />
          <div>
            <span>Participantes</span>
            <strong>
              {active.length} conectados · {desconectados.length} salieron
            </strong>
            <small>
              {reunion.conferencia.inicioRealAt
                ? `Meet inició ${formatTime(reunion.conferencia.inicioRealAt)}`
                : "Sin conferencia activa"}
            </small>
          </div>
        </article>
        <article
          className={
            reunion.grabacion.grabandoEnVivo
              ? "is-live-active"
              : grabacionFaltanteEnCurso
                ? "is-missing-required"
                : ""
          }
        >
          <Video size={18} aria-hidden="true" />
          <div>
            <span>Estado de grabación</span>
            <strong>
              {reunion.grabacion.grabandoEnVivo
                ? "● Grabando ahora en Meet"
                : `No se está grabando (${grabacionEstadoArchivoLabel(reunion.grabacion.estado)})`}
            </strong>
            <div className="operational-policy-vs-live">
              <span
                className={`operational-mini-pill ${reunion.grabacion.grabandoEnVivo ? "is-live-rec" : "is-req-no"}`}
              >
                {reunion.grabacion.grabandoEnVivo ? "En vivo: Grabando" : "En vivo: Inactiva"}
              </span>
              <span
                className={`operational-mini-pill ${reunion.requiereGrabacion ? "is-req-yes" : "is-req-no"}`}
              >
                {reunion.requiereGrabacion ? "Solicitud: Requerida" : "Solicitud: No requerida"}
              </span>
            </div>
          </div>
        </article>
        <article className={reunion.transcripcion.transcribiendoEnVivo ? "is-live-active" : ""}>
          <FileText size={18} aria-hidden="true" />
          <div>
            <span>Transcripción</span>
            <strong>
              {reunion.transcripcion.transcribiendoEnVivo
                ? "● Transcribiendo en Meet"
                : `No transcribiendo (${transcripcionLabel(reunion.transcripcion.estado)})`}
            </strong>
            <small>{reunion.artefactos.transcripciones} archivo(s) generado(s)</small>
          </div>
        </article>
        <article>
          <Users size={18} aria-hidden="true" />
          <div>
            <span>Host / Cohosts en sala</span>
            <strong>
              {hostsConectados.length} de {hostsYCohosts.length} conectados
            </strong>
            <small>
              {hostsConectados.length > 0
                ? hostsConectados.map((h) => h.nombre).join(", ")
                : "Ningún host/cohost conectado aún"}
            </small>
          </div>
        </article>
        <article>
          <Lock size={18} aria-hidden="true" />
          <div>
            <span>Acceso a la reunión</span>
            <strong>{tipoAccesoMeetLabel(reunion.meet.tipoAcceso)}</strong>
            <small>Moderación: {reunion.meet.moderacion === "ON" ? "Activa" : "Estándar"}</small>
          </div>
        </article>
      </section>

      <section className="content-section operational-hosts-card">
        <div className="section-heading">
          <div>
            <h2>Host, cohosts y equipo docente</h2>
            <p>Estado de conexión en tiempo real de los responsables de la sala.</p>
          </div>
          <span className="badge-tag">
            {hostsConectados.length}/{hostsYCohosts.length} en línea
          </span>
        </div>

        {hostsYCohosts.length === 0 ? (
          <div style={{ padding: "12px 16px" }}>
            <p className="operational-empty-inline">
              <Clock3 size={18} aria-hidden="true" />
              No hay host ni cohosts configurados para este encuentro.
            </p>
          </div>
        ) : (
          <ul className="operational-hosts-grid">
            {hostsYCohosts.map((persona) => (
              <li
                key={`${persona.rol}-${persona.email}`}
                className={`operational-host-item ${persona.conectado ? "is-online" : ""}`}
              >
                <div className="operational-host-info">
                  <strong title={persona.nombre}>{persona.nombre}</strong>
                  <small title={persona.email}>{persona.email}</small>
                </div>
                <div className="operational-host-badges">
                  <span className="badge-tag">{rolResponsableLabel(persona.rol)}</span>
                  <span className={`status ${persona.conectado ? "status-ok" : "status-neutral"}`}>
                    {persona.conectado
                      ? `En sala · ${persona.minutosConectado}m`
                      : persona.minutosConectado > 0
                        ? `Salió (${persona.minutosConectado}m)`
                        : "Ausente"}
                  </span>
                </div>
              </li>
            ))}
          </ul>
        )}
      </section>

      <OperationalAttendeeDatabaseManager
        instanciaId={reunion.id}
        asistentes={reunion.conferencia.asistentesRegistrados}
        enGruposPequenos={reunion.conferencia.enGruposPequenos}
        cantidadGruposPequenos={reunion.conferencia.cantidadGruposPequenos}
        ahoraIso={reunion.actualizadoAt.toISOString()}
      />

      <OperationalRemoteControlPanel
        instanciaId={reunion.id}
        tipoAccesoActual={reunion.meet.tipoAcceso}
        requiereGrabacionActual={reunion.requiereGrabacion}
        modalidadActual={reunion.modalidad}
        inicioAsistenciaIso={reunion.asistencia.inicioAt.toISOString()}
        finAsistenciaIso={reunion.asistencia.finAt.toISOString()}
        cohostEmails={reunion.meet.cohostEmails}
        tieneMeet={Boolean(reunion.meet.codigo)}
      />

      <section className="content-section operational-meet-card">
        <div className="section-heading">
          <div>
            <h2>Google Meet</h2>
            <p>Acceso e información técnica del espacio de reunión.</p>
          </div>
        </div>

        <dl className="operational-facts">
          <div>
            <dt>Código</dt>
            <dd>{reunion.meet.codigo ?? "Pendiente"}</dd>
          </div>
          <div className="is-wide">
            <dt>Organizador (Host)</dt>
            <dd>{reunion.meet.organizador ?? "Pendiente"}</dd>
          </div>
          <div>
            <dt>Tipo de acceso</dt>
            <dd>{tipoAccesoMeetLabel(reunion.meet.tipoAcceso)}</dd>
          </div>
          <div>
            <dt>Grupos pequeños</dt>
            <dd>
              {reunion.conferencia.enGruposPequenos
                ? `Activos (${reunion.conferencia.cantidadGruposPequenos})`
                : "Sala principal única"}
            </dd>
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
            <dt>Monitoreo</dt>
            <dd>
              {reunion.asistencia.asistente ?? (reunion.asistencia.requerida ? "Pendiente" : "No requiere")}
            </dd>
            {reunion.asistencia.requerida ? (
              <small>
                Llegada: {formatTime(reunion.asistencia.inicioAt)} · Salida:{" "}
                {formatTime(reunion.asistencia.finAt)}
              </small>
            ) : null}
          </div>
        </dl>

        {actor.rol === "ADMINISTRACION" && reunion.meet.eventoProveedorId ? (
          <div className="operational-admin-action">
            <AdminRetryMeetAction
              eventoProveedorId={reunion.meet.eventoProveedorId}
              label={repairLabel(reunion.meet.operacionPendiente, Boolean(reunion.meet.joinUrl))}
              operacion={
                reunion.meet.operacionPendiente ?? (reunion.meet.joinUrl ? "CONFIGURAR_MEET" : "PROVISIONAR")
              }
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
            <AlertTriangle size={15} aria-hidden="true" /> No se pudo actualizar Meet:{" "}
            {reunion.conferencia.error}
          </p>
        ) : null}
      </section>

      <details className="content-section operational-disclosure" open={reunion.incidencias.length > 0}>
        <summary>
          <div>
            <h2>Incidencias</h2>
            <p>Problemas operativos registrados para este encuentro.</p>
          </div>
          <span className="badge-tag">
            {
              reunion.incidencias.filter(({ estado }) => estado === "ABIERTA" || estado === "EN_ANALISIS")
                .length
            }
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
                    <span>
                      {incidencia.estado.replaceAll("_", " ").toLowerCase()} ·{" "}
                      {incidencia.severidad.toLowerCase()}
                    </span>
                  </div>
                  <p>{incidencia.descripcion}</p>
                  <small>
                    {formatDate(incidencia.createdAt)} · {formatTime(incidencia.createdAt)}
                  </small>
                </li>
              ))}
            </ul>
          )}
        </div>
      </details>

      <OperationalIncidentForm instanciaId={reunion.id} />

      {actor.rol === "ASISTENTE_TECNICO" &&
      reunion.asistencia.asignacionId &&
      (reunion.estado === "FINALIZADA" || reunion.estado === "NO_INICIADA") ? (
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
            <p>Grabaciones y transcripciones sincronizadas con Google.</p>
          </div>
        </div>
        <div className="operational-artifacts-grid">
          <div>
            <strong>{reunion.artefactos.grabaciones}</strong>
            <span>Grabaciones</span>
          </div>
          <div>
            <strong>{reunion.artefactos.transcripciones}</strong>
            <span>Transcripciones</span>
          </div>
          <div>
            <strong>{reunion.artefactos.notas}</strong>
            <span>Notas</span>
          </div>
        </div>
        <div style={{ display: "flex", gap: "0.75rem", flexWrap: "wrap", marginTop: "0.75rem" }}>
          {reunion.grabacion.url ? (
            <a
              className="secondary-action operational-recording-link"
              href={reunion.grabacion.url}
              target="_blank"
              rel="noreferrer"
            >
              <Video size={16} aria-hidden="true" />
              Ver grabación
            </a>
          ) : null}
          {reunion.transcripcion.url ? (
            <a
              className="secondary-action operational-recording-link"
              href={reunion.transcripcion.url}
              target="_blank"
              rel="noreferrer"
            >
              <FileText size={16} aria-hidden="true" />
              Ver transcripción
            </a>
          ) : null}
        </div>
        <p className="operational-updated">Actualizado: {formatTime(reunion.actualizadoAt)}</p>
      </section>
    </div>
  );
}

function statusClass(estado: string): string {
  if (estado === "EN_CURSO" || estado === "FINALIZADA") {
    return "status-ok";
  }
  if (estado === "ESPERANDO_INICIO") {
    return "status-warning";
  }
  if (estado === "NO_INICIADA") {
    return "status-error";
  }
  return "status-neutral";
}

function estadoLabel(estado: string): string {
  if (estado === "ESPERANDO_INICIO") {
    return "Esperando inicio";
  }
  if (estado === "EN_CURSO") {
    return "En curso";
  }
  if (estado === "FINALIZADA") {
    return "Finalizada";
  }
  if (estado === "NO_INICIADA") {
    return "No iniciada";
  }
  return "Programada";
}

function grabacionEstadoArchivoLabel(estado: string): string {
  if (estado === "PROCESANDO") {
    return "procesando archivo";
  }
  if (estado === "DISPONIBLE") {
    return "archivo disponible";
  }
  if (estado === "NO_REALIZADA") {
    return "sin archivo generado";
  }
  return "sin grabación activa";
}

function transcripcionLabel(estado: string): string {
  if (estado === "TRANSCRIBIENDO") {
    return "Transcribiendo en vivo";
  }
  if (estado === "PROCESANDO") {
    return "procesando archivo";
  }
  if (estado === "DISPONIBLE") {
    return "archivo disponible";
  }
  return "inactiva";
}

function tipoAccesoMeetLabel(tipo: string | null): string {
  if (tipo === "OPEN") {
    return "Abierto (OPEN)";
  }
  if (tipo === "TRUSTED") {
    return "Institucional / Confianza (TRUSTED)";
  }
  if (tipo === "RESTRICTED") {
    return "Restringido (RESTRICTED)";
  }
  return "Pendiente";
}

function rolResponsableLabel(rol: string): string {
  if (rol === "HOST") {
    return "Host";
  }
  if (rol === "COHOST") {
    return "Cohost";
  }
  if (rol === "DOCENTE") {
    return "Docente";
  }
  if (rol === "ASISTENTE_TECNICO") {
    return "Asistente";
  }
  return rol;
}

function disponibilidadLabel(estado: string): string {
  if (estado === "OK") {
    return "Datos confirmados por Google Meet";
  }
  if (estado === "SIN_CONFERENCIA") {
    return "Todavía no existe una conferencia real";
  }
  if (estado === "SIN_CREDENCIALES") {
    return "Google Workspace no está disponible";
  }
  if (estado === "ERROR") {
    return "La última consulta a Google falló";
  }
  return "Meet aún no está configurado";
}

function repairLabel(
  operacion: "PROVISIONAR" | "REPROGRAMAR" | "CONFIGURAR_MEET" | "CANCELAR" | null,
  hasMeet: boolean
): string {
  if (operacion === "REPROGRAMAR") {
    return "Reintentar reprogramación";
  }
  if (operacion === "CONFIGURAR_MEET") {
    return "Reintentar configuración de Meet";
  }
  if (operacion === "CANCELAR") {
    return "Reintentar cancelación en Calendar";
  }
  if (operacion === "PROVISIONAR") {
    return "Reintentar provisión de Meet";
  }
  return hasMeet ? "Revisar configuración de Meet" : "Reintentar provisión de Meet";
}

function incidenciaTipoLabel(tipo: string): string {
  if (tipo === "DOCENTE_NO_INGRESA") {
    return "Docente no ingresa";
  }
  if (tipo === "AUDIO_VIDEO") {
    return "Audio o video";
  }
  if (tipo === "GRABACION") {
    return "Grabación";
  }
  if (tipo === "SALA_INCORRECTA") {
    return "Sala incorrecta";
  }
  if (tipo === "CONECTIVIDAD") {
    return "Conectividad";
  }
  return tipo === "OTRA" ? "Otra" : tipo.replaceAll("_", " ").toLowerCase();
}
