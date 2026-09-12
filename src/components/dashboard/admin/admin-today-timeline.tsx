import {
  AlertTriangle,
  ArrowRight,
  CalendarDays,
  CheckCircle2,
  Clock,
  Video
} from "lucide-react";
import Link from "next/link";
import { CopyMeetLinkButton } from "@/src/components/copy-meet-link-button";
import { LiveParticipantsIndicator } from "@/src/components/dashboard/admin/live-participants-indicator";
import { formatDate, formatTime } from "@/src/lib/ui/format";
import type { AdminTodayMeetingDTO } from "@/src/modules/dashboard/admin-dashboard.adapter";

export function AdminTodayTimeline({
  meetings
}: Readonly<{
  meetings: readonly AdminTodayMeetingDTO[];
}>) {
  return (
    <section className="dashboard-content-section admin-today-section">
      <div className="section-heading">
        <div>
          <h2>Agenda de hoy</h2>
          <p>Reuniones programadas y su estado operativo.</p>
        </div>
        <Link className="text-link" href="/reuniones">
          Ver agenda completa <ArrowRight size={16} />
        </Link>
      </div>

      {meetings.length === 0 ? (
        <div className="empty-state">
          <CalendarDays size={24} />
          <p>No hay reuniones programadas para el día de hoy.</p>
        </div>
      ) : (
        <div className="admin-today-timeline-list">
          {meetings.map((meeting) => {
            const inicio = new Date(meeting.inicioProgramadoAt);
            const fin = new Date(meeting.finProgramadoAt);
            const isLive = meeting.estadoTemporal === "EN_VIVO";

            return (
              <article
                className={`admin-timeline-item ${isLive ? "is-live-now" : ""}`}
                key={meeting.id}
              >
                <div className="admin-timeline-when">
                  {isLive ? (
                    <span className="live-pill-sm">
                      <span className="live-indicator-dot" />
                      <strong>En vivo</strong>
                    </span>
                  ) : (
                    <span className="timeline-hour-badge">
                      <Clock size={13} />
                      <strong>{formatTime(inicio)}</strong>
                    </span>
                  )}
                  <span className="timeline-sub-hour">
                    {formatDate(inicio)} · {formatTime(inicio)}–{formatTime(fin)}
                  </span>
                  {isLive ? <LiveParticipantsIndicator instanciaId={meeting.id} /> : null}
                </div>

                <div className="admin-timeline-info">
                  <div className="admin-timeline-title-row">
                    <h3 className="admin-timeline-title">
                      <Link href={`/reuniones/${meeting.solicitudId}`}>{meeting.titulo}</Link>
                    </h3>
                    <span className="badge-tag">
                      {meeting.modalidad === "HIBRIDA" ? "Híbrida" : "Virtual"}
                    </span>
                  </div>

                  <div className="admin-timeline-academic">
                    <span>
                      Programa: <strong>{meeting.programa}</strong>
                    </span>
                    <span>·</span>
                    <span>
                      Docente: <strong>{meeting.docenteNombre}</strong>
                    </span>
                  </div>

                  <div className="admin-timeline-status-row">
                    <div className="admin-timeline-assistant">
                      <small>Asistencia técnica:</small>
                      {meeting.asistente ? (
                        <span className="status-text-ok">
                          <CheckCircle2 size={13} /> {meeting.asistente.nombre}
                        </span>
                      ) : meeting.requiereAsistencia ? (
                        <span className="status-text-warning">
                          <AlertTriangle size={13} /> Pendiente
                        </span>
                      ) : (
                        <span className="muted-text">No requiere</span>
                      )}
                    </div>

                    <div className="admin-timeline-cohost">
                      <small>Cohosts:</small>
                      {meeting.cohostConfirmado ? (
                        <span className="status-text-ok" title="Verificado en Google Meet">
                          <CheckCircle2 size={13} /> Confirmado en Meet
                        </span>
                      ) : meeting.cohostCount > 0 ? (
                        <span className="status-text-warning" title="Permisos de cohost en proceso de confirmación">
                          <AlertTriangle size={13} /> Pendiente en Meet
                        </span>
                      ) : (
                        <span className="muted-text">Sin cohost</span>
                      )}
                    </div>
                  </div>
                </div>

                <div className="admin-timeline-actions">
                  {meeting.joinUrl ? (
                    <>
                      <a
                        className="secondary-action admin-meet-btn"
                        href={meeting.joinUrl}
                        rel="noreferrer"
                        target="_blank"
                      >
                        <Video size={16} />
                        <span>Meet</span>
                      </a>
                      <CopyMeetLinkButton url={meeting.joinUrl} />
                    </>
                  ) : (
                    <span className="status-muted">Link pendiente</span>
                  )}
                </div>
              </article>
            );
          })}
        </div>
      )}
    </section>
  );
}
