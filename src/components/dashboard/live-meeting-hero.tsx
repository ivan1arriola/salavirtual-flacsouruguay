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
import { formatDate, formatTime } from "@/src/lib/ui/format";
import {
  determinarEstadoTemporal,
  formatearTiempoHastaReunion
} from "@/src/modules/dashboard/dashboard.domain";
import type { HeroMeetingDTO } from "@/src/modules/dashboard/types";

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
  const tiempoEtiqueta = formatearTiempoHastaReunion(inicio, ahora);

  return (
    <section
      className={`dashboard-hero-card ${isLive ? "is-live" : "is-upcoming"}`}
      aria-label="Reunión o clase inmediata"
    >
      <div className="dashboard-hero-card-header">
        <div className="dashboard-hero-timing">
          {isLive ? (
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
            {formatDate(inicio)} · {formatTime(inicio)}–{formatTime(fin)}
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
            <Link href={`/reuniones/${meeting.solicitudId}`}>{meeting.titulo}</Link>
          </h2>
          {meeting.salaNombre ? (
            <p className="dashboard-hero-room">
              Sala virtual: <strong>{meeting.salaNombre}</strong>
            </p>
          ) : null}
        </div>

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
                <span>Entrar a Google Meet</span>
              </a>
              <CopyMeetLinkButton url={meeting.joinUrl} />
            </>
          ) : (
            <span className="status status-warning hero-pending-meet">
              Enlace de Meet pendiente de generación
            </span>
          )}

          {role === "ASISTENTE_TECNICO" ? (
            <Link className="secondary-action" href={`/operacion/${meeting.id}`}>
              <Activity size={16} />
              Operar reunión
            </Link>
          ) : null}

          <Link
            className="secondary-action"
            href={`/reuniones/${meeting.solicitudId}`}
          >
            Ficha del encuentro
          </Link>
        </div>
      </div>

      <footer className="dashboard-hero-footer">
        <div className="dashboard-hero-metadata-item">
          <UserCheck size={16} />
          {role === "ASISTENTE_TECNICO" && meeting.requiereAsistencia ? (
            <span className="status-ok-text">
              <CheckCircle2 size={16} /> Tu cobertura técnica confirmada
            </span>
          ) : meeting.asistente ? (
            <span>
              Asistente técnico: <strong>{meeting.asistente.nombre}</strong>
            </span>
          ) : meeting.requiereAsistencia ? (
            <span className="status-warning-text">
              <AlertTriangle size={14} /> Asistencia técnica pendiente de asignación
            </span>
          ) : (
            <span className="muted-text">No requiere asistencia técnica</span>
          )}
        </div>

        <div className="dashboard-hero-metadata-item">
          {meeting.cohostConfirmado ? (
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
          )}
        </div>
      </footer>
    </section>
  );
}

