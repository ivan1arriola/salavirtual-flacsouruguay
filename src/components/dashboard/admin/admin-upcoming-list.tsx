import { ArrowRight, CalendarDays } from "lucide-react";
import Link from "next/link";
import { formatDate, formatTime } from "@/src/lib/ui/format";
import type { AdminUpcomingMeetingDTO } from "@/src/modules/dashboard/admin-dashboard.adapter";
import styles from "./admin-upcoming-list.module.css";

export function AdminUpcomingList({
  meetings
}: Readonly<{
  meetings: readonly AdminUpcomingMeetingDTO[];
}>) {
  return (
    <section aria-labelledby="admin-upcoming-title" className="dashboard-content-section admin-upcoming-section">
      <div className="section-heading">
        <div>
          <h2 id="admin-upcoming-title">Próximas reuniones</h2>
          <p>Encuentros previstos después de hoy, durante los próximos siete días.</p>
        </div>
        <Link className="text-link" href="/reuniones?vista=encuentros">
          Ver agenda completa <ArrowRight aria-hidden="true" size={16} />
        </Link>
      </div>

      {meetings.length === 0 ? (
        <div className="empty-state">
          <CalendarDays aria-hidden="true" size={22} />
          <p>No hay otros encuentros programados para los próximos siete días.</p>
        </div>
      ) : (
        <ol className={styles.list}>
          {meetings.map((meeting) => {
            const startsAt = new Date(meeting.inicioProgramadoAt);
            const endsAt = new Date(meeting.finProgramadoAt);
            return (
              <li className={styles.item} key={meeting.id}>
                <time className={styles.when} dateTime={startsAt.toISOString()}>
                  <span>{formatDate(startsAt)}</span>
                  <strong>{formatTime(startsAt)}–{formatTime(endsAt)}</strong>
                  <small>Horario del encuentro</small>
                </time>
                <div className={styles.details}>
                  <Link className={styles.title} href={`/reuniones/${meeting.solicitudId}`}>
                    {meeting.titulo}
                  </Link>
                  <p>{meeting.programa} · {meeting.docenteNombre}</p>
                </div>
                <div className={styles.status}>
                  <span>{meeting.modalidad === "HIBRIDA" ? "Modalidad híbrida" : "Modalidad virtual"}</span>
                  {meeting.requiereAsistencia ? (
                    <span className={meeting.asistenteNombre ? styles.assigned : styles.pending}>
                      {meeting.asistenteNombre
                        ? `Monitoreo: ${meeting.asistenteNombre}`
                        : "Monitoreo sin asignar"}
                    </span>
                  ) : <span>Sin monitoreo</span>}
                </div>
              </li>
            );
          })}
        </ol>
      )}
    </section>
  );
}
