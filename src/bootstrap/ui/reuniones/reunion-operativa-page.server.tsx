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
import { AdminRetryMeetAction } from "@/src/components/admin-attention-actions";
import { OperationalIncidentForm } from "@/src/components/operational-incident-form";
import { OperationalAutoRefresh } from "@/src/components/operational-auto-refresh";
import { OperationalAssistanceClosureForm } from "@/src/components/operational-assistance-closure-form";
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

  return (
    <div className="meeting-detail-v2">
      <div className="section-heading">
        <Link className="meeting-detail-back" href="/">
          <ArrowLeft size={15} aria-hidden="true" />
          Volver al dashboard
        </Link>
        <div className="encounter-card-actions">
          <OperationalAutoRefresh enabled={reunion.estado === "ESPERANDO_INICIO" || reunion.estado === "EN_CURSO"} />
          <RefreshButton />
        </div>
      </div>

      <header className="page-header">
        <div>
          <p className="page-eyebrow">{reunion.programa}</p>
          <h1>{reunion.titulo}</h1>
          <p>
            {reunion.docente} · {formatDate(reunion.inicioProgramadoAt)} ·{" "}
            {formatTime(reunion.inicioProgramadoAt)}–{formatTime(reunion.finProgramadoAt)}
          </p>
        </div>
        <span className={`status ${statusClass(reunion.estado)}`}>
          {estadoLabel(reunion.estado)}
        </span>
      </header>

      <section className="meeting-detail-summary" aria-label="Estado operativo">
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
            <span>Participantes activos</span>
            <strong>{active.length}</strong>
            <small>
              {reunion.conferencia.inicioRealAt
                ? `Meet inició a las ${formatTime(reunion.conferencia.inicioRealAt)}`
                : "Meet todavía no confirmó inicio"}
            </small>
          </div>
        </article>
        <article>
          <Video size={18} aria-hidden="true" />
          <div>
            <span>Grabación</span>
            <strong>{grabacionLabel(reunion.grabacion.estado)}</strong>
            <small>{reunion.requiereGrabacion ? "Requerida para este encuentro" : "No requerida"}</small>
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

      <section className="content-section">
        <div className="section-heading">
          <div>
            <h2>Google Meet</h2>
            <p>Estado de integración y accesos para operar el encuentro.</p>
          </div>
          <div className="encounter-card-actions">
            {reunion.meet.joinUrl ? (
              <a className="primary-action" href={reunion.meet.joinUrl} target="_blank" rel="noreferrer">
                <Video size={16} aria-hidden="true" />
                Entrar a Meet
              </a>
            ) : null}
            <Link className="secondary-action" href={`/reuniones/${reunion.solicitudId}`}>
              Ficha completa
            </Link>
          </div>
        </div>

        <div className="table-wrap">
          <table className="data-table">
            <tbody>
              <tr><th>Código</th><td>{reunion.meet.codigo ?? "Pendiente"}</td></tr>
              <tr><th>Organizador</th><td>{reunion.meet.organizador ?? "Pendiente"}</td></tr>
              <tr><th>Integración</th><td>{reunion.meet.estadoIntegracion ?? "Sin evento proveedor"}</td></tr>
              <tr><th>Operación pendiente</th><td>{reunion.meet.operacionPendiente ?? "Ninguna"}</td></tr>
              <tr><th>Asistencia técnica</th><td>{reunion.asistencia.asistente ?? (reunion.asistencia.requerida ? "Pendiente" : "No requiere")}</td></tr>
            </tbody>
          </table>
        </div>

        {actor.rol === "ADMINISTRACION" && reunion.meet.eventoProveedorId ? (
          <AdminRetryMeetAction
            eventoProveedorId={reunion.meet.eventoProveedorId}
            label={repairLabel(reunion.meet.operacionPendiente, Boolean(reunion.meet.joinUrl))}
            operacion={reunion.meet.operacionPendiente ?? (reunion.meet.joinUrl ? "CONFIGURAR_MEET" : "PROVISIONAR")}
          />
        ) : null}

        {reunion.meet.errorIntegracion ? (
          <p className="status-warning-text">
            <AlertTriangle size={15} aria-hidden="true" /> {reunion.meet.errorIntegracion}
          </p>
        ) : null}
        {reunion.conferencia.error ? (
          <p className="status-warning-text">
            <AlertTriangle size={15} aria-hidden="true" /> No se pudo actualizar Meet: {reunion.conferencia.error}
          </p>
        ) : null}
      </section>

      <section className="content-section">
        <div className="section-heading">
          <div>
            <h2>Participantes activos</h2>
            <p>Se consulta al abrir o actualizar esta consola; el dashboard no hace polling a Google.</p>
          </div>
          <span className="badge-tag">{active.length} activos</span>
        </div>

        {active.length === 0 ? (
          <div className="empty-state">
            <Clock3 size={22} aria-hidden="true" />
            <p>No hay participantes activos confirmados en este momento.</p>
          </div>
        ) : (
          <div className="table-wrap">
            <table className="data-table">
              <thead>
                <tr><th>Participante</th><th>Tipo</th></tr>
              </thead>
              <tbody>
                {active.map((participant, index) => (
                  <tr key={participant.user ?? `${participant.nombre}-${index}`}>
                    <td><strong>{participant.nombre}</strong></td>
                    <td>{tipoParticipanteLabel(participant.tipo)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>

      <section className="content-section">
        <div className="section-heading">
          <div>
            <h2>Incidencias</h2>
            <p>Problemas operativos registrados para este encuentro.</p>
          </div>
          <span className="badge-tag">
            {reunion.incidencias.filter(({ estado }) => estado === "ABIERTA" || estado === "EN_ANALISIS").length} abiertas
          </span>
        </div>

        {reunion.incidencias.length === 0 ? (
          <div className="empty-state">
            <CheckCircle2 size={22} aria-hidden="true" />
            <p>No hay incidencias registradas para este encuentro.</p>
          </div>
        ) : (
          <div className="table-wrap">
            <table className="data-table">
              <thead>
                <tr><th>Estado</th><th>Tipo</th><th>Severidad</th><th>Descripción</th><th>Registro</th></tr>
              </thead>
              <tbody>
                {reunion.incidencias.map((incidencia) => (
                  <tr key={incidencia.id}>
                    <td>{incidencia.estado.replaceAll("_", " ").toLowerCase()}</td>
                    <td>{incidenciaTipoLabel(incidencia.tipo)}</td>
                    <td>{incidencia.severidad.toLowerCase()}</td>
                    <td>{incidencia.descripcion}</td>
                    <td>{formatDate(incidencia.createdAt)} · {formatTime(incidencia.createdAt)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>

      <OperationalIncidentForm instanciaId={reunion.id} />

      {actor.rol === "ASISTENTE_TECNICO"
        && reunion.asistencia.asignacionId
        && (reunion.estado === "FINALIZADA" || reunion.estado === "NO_INICIADA") ? (
        <OperationalAssistanceClosureForm
          asignacionId={reunion.asistencia.asignacionId}
          inicioProgramado={reunion.inicioProgramadoAt.toISOString()}
          finProgramado={reunion.finProgramadoAt.toISOString()}
          cierreConfirmado={reunion.asistencia.cierreConfirmado}
        />
      ) : null}

      <section className="content-section">
        <div className="section-heading">
          <div>
            <h2>Artefactos</h2>
            <p>Resultado actual de la sincronización con Google Meet y Drive.</p>
          </div>
        </div>
        <div className="meeting-detail-summary">
          <article><div><span>Grabaciones</span><strong>{reunion.artefactos.grabaciones}</strong></div></article>
          <article><div><span>Transcripciones</span><strong>{reunion.artefactos.transcripciones}</strong></div></article>
          <article><div><span>Notas</span><strong>{reunion.artefactos.notas}</strong></div></article>
        </div>
        {reunion.grabacion.url ? (
          <a className="secondary-action" href={reunion.grabacion.url} target="_blank" rel="noreferrer">
            <Video size={16} aria-hidden="true" />
            Ver grabación
          </a>
        ) : null}
        <p className="muted-text">Actualizado: {formatTime(reunion.actualizadoAt)}</p>
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
