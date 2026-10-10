import { ArrowRight, CalendarDays, ExternalLink, Video } from "lucide-react";
import Link from "next/link";
import { CopyMeetLinkButton } from "@/src/components/copy-meet-link-button";
import { MeetingScheduleTimes } from "@/src/components/meeting-schedule-times";
import { formatDate } from "@/src/lib/ui/format";
import type { UpcomingMeetingSummaryDTO } from "@/src/modules/dashboard/types";

export function TeacherUpcomingList({
  meetings
}: Readonly<{
  meetings: readonly UpcomingMeetingSummaryDTO[];
}>) {
  return (
    <section className="dashboard-content-section teacher-upcoming-section">
      <div className="section-heading">
        <div>
          <h2>Próximas clases</h2>
          <p>Tu cronograma académico ordenado cronológicamente.</p>
        </div>
        <Link className="text-link" href="/reuniones">
          Ver agenda completa <ArrowRight size={16} />
        </Link>
      </div>

      {meetings.length === 0 ? (
        <div className="empty-state">
          <CalendarDays size={24} />
          <p>No tenés más reuniones programadas para los próximos días.</p>
        </div>
      ) : (
        <div className="teacher-upcoming-grid">
          {meetings.map((meeting) => {
            const inicio = new Date(meeting.inicioProgramadoAt);
            const fin = new Date(meeting.finProgramadoAt);

            return (
              <article className="teacher-upcoming-card" key={meeting.id}>
                <div className="teacher-upcoming-card-when">
                  <span className="teacher-upcoming-card-date">{formatDate(inicio)}</span>
                  <MeetingScheduleTimes startsAt={inicio} endsAt={fin} requiresAssistance={meeting.requiereAsistencia} modality={meeting.modalidad} assistanceStartsAt={meeting.inicioAsistenciaAt} assistanceEndsAt={meeting.finAsistenciaAt} compact />
                  <span className="badge-tag">
                    {meeting.modalidad === "HIBRIDA" ? "Híbrida" : "Virtual"}
                  </span>
                </div>

                <div className="teacher-upcoming-card-content">
                  <small className="teacher-upcoming-card-program">{meeting.programa}</small>
                  <h3 className="teacher-upcoming-card-title">
                    <Link href={`/reuniones/${meeting.solicitudId}`}>{meeting.titulo}</Link>
                  </h3>
                  <p className="teacher-upcoming-card-assistant">
                    {meeting.asistenteNombre ? (
                      <span>Asistente técnico: <strong>{meeting.asistenteNombre}</strong></span>
                    ) : meeting.requiereAsistencia ? (
                      <span className="text-warning">Asistencia pendiente</span>
                    ) : (
                      <span className="muted-text">Sin asistencia requerida</span>
                    )}
                  </p>
                </div>

                <div className="teacher-upcoming-card-actions">
                  {meeting.joinUrl ? (
                    <>
                      <a
                        className="secondary-action teacher-meet-link"
                        href={meeting.joinUrl}
                        rel="noreferrer"
                        target="_blank"
                        title="Abrir reunión en Meet"
                      >
                        <Video size={16} />
                        <span>Meet</span>
                        <ExternalLink size={12} />
                      </a>
                      <CopyMeetLinkButton url={meeting.joinUrl} />
                    </>
                  ) : (
                    <span className="status-muted">Link en preparación</span>
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

