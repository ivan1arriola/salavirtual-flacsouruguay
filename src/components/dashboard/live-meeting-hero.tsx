import {
  Activity,
  AlertTriangle,
  CalendarCheck2,
  CheckCircle2,
  Clock,
  Sparkles,
  UserCheck,
  Video
} from "lucide-react";
import Link from "next/link";
import { CopyMeetLinkButton } from "@/src/components/copy-meet-link-button";
import { MeetingScheduleTimes } from "@/src/components/meeting-schedule-times";
import { formatDate, formatTime } from "@/src/lib/ui/format";
import {
  determinarEstadoTemporal,
  formatearTiempoHastaReunion
} from "@/src/modules/dashboard/dashboard.domain";
import type { HeroMeetingDTO } from "@/src/modules/dashboard/types";
import { getMeetingProviderPresentation } from "@/src/modules/dashboard/meeting-provider.presentation";

export function LiveMeetingHero({
  meeting,
  role,
  emptyStateTitle,
  emptyStateCopy,
  emptyStateActionHref,
  emptyStateActionLabel
}: Readonly<{
  meeting: HeroMeetingDTO | null;
  role: "DOCENTE" | "ASISTENTE_TECNICO" | "ADMINISTRACION";
  emptyStateTitle?: string;
  emptyStateCopy?: string;
  emptyStateActionHref?: string;
  emptyStateActionLabel?: string;
}>) {
  const ahora = new Date();
  const provider = getMeetingProviderPresentation(meeting?.providerType ?? null);

  if (!meeting) {
    const defaultTitle =
      role === "DOCENTE"
        ? "No tenés clases programadas para hoy"
        : role === "ASISTENTE_TECNICO"
          ? "No tenés coberturas asignadas hoy"
          : "Sin reuniones inmediatas en agenda";

    const defaultCopy =
      role === "DOCENTE"
        ? "Podés consultar tu cronograma completo de la semana o crear una nueva reunión."
        : role === "ASISTENTE_TECNICO"
          ? "Revisá las salas abiertas que necesitan soporte para postularte."
          : "Todas las salas están al día en la planificación institucional.";

    const defaultHref =
      role === "ASISTENTE_TECNICO" ? "/agenda-abierta" : "/reuniones";
    const defaultLabel =
      role === "ASISTENTE_TECNICO" ? "Ver agenda abierta" : "Ver mi agenda";

    return (
      <section className="dashboard-hero-card is-empty" aria-label="Estado de actividad inmediata">
        <div className="dashboard-hero-empty-content">
          <span className="dashboard-hero-empty-icon">
            <CalendarCheck2 size={26} />
          </span>
          <div>
            <h2>{emptyStateTitle ?? defaultTitle}</h2>
            <p>{emptyStateCopy ?? defaultCopy}</p>
          </div>
        </div>
        <div className="dashboard-hero-empty-action">
          <Link
            className="secondary-action"
            href={emptyStateActionHref ?? defaultHref}
          >
            {emptyStateActionLabel ?? defaultLabel}
          </Link>
        </div>
      </section>
    );
  }

  const inicio = new Date(meeting.inicioProgramadoAt);
  const fin = new Date(meeting.finProgramadoAt);
  const estadoTemporal = determinarEstadoTemporal(inicio, fin, ahora);
  const isLive = estadoTemporal === "EN_VIVO";
  const inicioAsistencia = meeting.inicioAsistenciaAt
    ? new Date(meeting.inicioAsistenciaAt)
    : meeting.requiereAsistencia && meeting.modalidad === "VIRTUAL"
      ? new Date(inicio.getTime() - 15 * 60 * 1000)
      : inicio;
  const finAsistencia = new Date(meeting.finAsistenciaAt ?? meeting.finProgramadoAt);
  const coberturaDiferente = meeting.requiereAsistencia && (inicioAsistencia.getTime() !== inicio.getTime() || finAsistencia.getTime() !== fin.getTime());
  const paraAsistente = role === "ASISTENTE_TECNICO" && meeting.requiereAsistencia;
  const coberturaSinHorario = paraAsistente && meeting.modalidad === "HIBRIDA" && (!meeting.inicioAsistenciaAt || !meeting.finAsistenciaAt);
  const tiempoEtiqueta = coberturaSinHorario ? "Falta confirmar tu hora de llegada" : paraAsistente
    ? inicioAsistencia > ahora
      ? formatearTiempoHastaReunion(inicioAsistencia, ahora).replace(/^Empieza en/, "Tu asistencia comienza en")
      : "Tu monitoreo ya comenzó"
    : formatearTiempoHastaReunion(inicio, ahora);

  return (
    <section
      className={`dashboard-hero-card ${isLive ? "is-live" : "is-upcoming"}`}
      aria-label="Reunión o clase inmediata"
    >
      <div className="dashboard-hero-card-header">
        <div className="dashboard-hero-timing">
          {isLive && !paraAsistente ? (
            <span className="live-pill">
              <span className="live-indicator-dot" />
              <strong>En vivo ahora</strong>
            </span>
          ) : (
            <span className="timing-pill">
              <Clock size={14} />
              <span>{tiempoEtiqueta}</span>
            </span>
          )}
          <span className="dashboard-hero-date">
            {formatDate(inicio)} · Encuentro: {formatTime(inicio)}–{formatTime(fin)}
          </span>
        </div>

        <span className="dashboard-hero-modality-badge">
          {meeting.modalidad === "HIBRIDA" ? "Modalidad Híbrida" : "Modalidad Virtual"}
        </span>
      </div>

      <div className="dashboard-hero-body">
        <div className="dashboard-hero-main-info">
          <p className="dashboard-hero-program">{meeting.programa}</p>
          <h2 className="dashboard-hero-title">
            <Link href={role === "ASISTENTE_TECNICO" ? `/operacion/${meeting.id}` : `/reuniones/${meeting.solicitudId}`}>{meeting.titulo}</Link>
          </h2>
          {meeting.salaNombre ? (
            <p className="dashboard-hero-room">
              Sala: <strong>{meeting.salaNombre}</strong>
            </p>
          ) : null}
        </div>

        <MeetingScheduleTimes
          startsAt={inicio}
          endsAt={fin}
          requiresAssistance={meeting.requiereAsistencia}
          modality={meeting.modalidad}
          assistanceStartsAt={meeting.inicioAsistenciaAt}
          assistanceEndsAt={meeting.finAsistenciaAt}
          viewerIsAssistant={paraAsistente}
          compact
        />
        {coberturaDiferente && role !== "ASISTENTE_TECNICO" ? <p className="dashboard-hero-schedule-notice">El horario de llegada del asistente es distinto al inicio del encuentro.</p> : null}

        <div className="dashboard-hero-actions">
          {meeting.joinUrl ? (
            <>
              <a
                className="primary-action hero-meet-action"
                href={meeting.joinUrl}
                rel="noreferrer"
                target="_blank"
              >
                <Video size={18} />
                <span>{provider.joinLabel}</span>
              </a>
              <CopyMeetLinkButton url={meeting.joinUrl} />
            </>
          ) : (
            <span className="status status-warning hero-pending-meet">
              {provider.pendingLinkLabel}
            </span>
          )}

          {role === "ASISTENTE_TECNICO" ? (
            <Link className="secondary-action" href={`/operacion/${meeting.id}`}>
              <Activity size={16} />
              Operar reunión
            </Link>
          ) : null}

          {role !== "ASISTENTE_TECNICO" ? (
            <Link className="secondary-action" href={`/reuniones/${meeting.solicitudId}`}>
              Ficha del encuentro
            </Link>
          ) : null}
        </div>
      </div>

      <footer className="dashboard-hero-footer">
        <div className="dashboard-hero-metadata-item">
          <UserCheck size={16} />
          {role === "ASISTENTE_TECNICO" && meeting.requiereAsistencia ? (
            <span className="status-ok-text">
              <CheckCircle2 size={16} /> Tu monitoreo confirmado
            </span>
          ) : meeting.asistente ? (
            <span>
              Asistente de monitoreo: <strong>{meeting.asistente.nombre}</strong>
            </span>
          ) : meeting.requiereAsistencia ? (
            <span className="status-warning-text">
              <AlertTriangle size={14} /> Monitoreo pendiente de asignación
            </span>
          ) : (
            <span className="muted-text">No requiere monitoreo</span>
          )}
        </div>

        <div className="dashboard-hero-metadata-item">
          {provider.supportsCohosts ? meeting.cohostConfirmado ? (
            <span className="status-ok-text">
              <CheckCircle2 size={16} /> Permisos de cohost confirmados en Meet
            </span>
          ) : meeting.cohosts.length > 0 ? (
            <span className="status-warning-text">
              <AlertTriangle size={15} /> Permisos de cohost en proceso de confirmación
            </span>
          ) : (
            <span className="muted-text">
              <Sparkles size={15} /> Sin cohosts adicionales configurados
            </span>
          ) : null}
        </div>
      </footer>
    </section>
  );
}

