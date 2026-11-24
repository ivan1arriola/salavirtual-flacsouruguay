import { ArrowRight, ExternalLink, Film, FolderCheck } from "lucide-react";
import Link from "next/link";
import { formatShortDate } from "@/src/lib/ui/format";
import type { RecentRecordingDTO } from "@/src/modules/dashboard/types";

export function TeacherRecentRecordings({
  recordings
}: Readonly<{
  recordings: readonly RecentRecordingDTO[];
}>) {
  if (recordings.length === 0) {
    return (
      <section className="dashboard-content-section teacher-recordings-section">
        <div className="section-heading">
          <div>
            <h2>Grabaciones recientes</h2>
            <p>Acceso directo a las clases grabadas de tus cursos.</p>
          </div>
          <Link className="text-link" href="/grabaciones">
            Biblioteca de grabaciones <ArrowRight size={16} />
          </Link>
        </div>
        <div className="empty-state">
          <FolderCheck size={24} />
          <p>Las grabaciones disponibles de tus clases aparecerán aquí.</p>
        </div>
      </section>
    );
  }

  return (
    <section className="dashboard-content-section teacher-recordings-section">
      <div className="section-heading">
        <div>
          <h2>Grabaciones recientes</h2>
          <p>Acceso directo a los grabaciones recientes de tus cursos.</p>
        </div>
        <Link className="text-link" href="/grabaciones">
          Biblioteca de grabaciones <ArrowRight size={16} />
        </Link>
      </div>

      <div className="teacher-recordings-grid">
        {recordings.map((rec) => {
          const detailUrl = rec.publicUrl ?? "/grabaciones";
          return (
            <article className="teacher-recording-card" key={rec.id}>
              <div className="teacher-recording-card-header">
                <span className="teacher-recording-icon">
                  <Film size={18} />
                </span>
                <div>
                  <small className="teacher-recording-program">{rec.programa}</small>
                  <h3 className="teacher-recording-title">
                    <Link href={detailUrl}>{rec.titulo}</Link>
                  </h3>
                </div>
              </div>

              <div className="teacher-recording-card-meta">
                <span>{formatShortDate(new Date(rec.fecha))}</span>
                {rec.duracionMinutos ? <span>· {rec.duracionMinutos} min</span> : null}
              </div>

              <div className="teacher-recording-card-actions">
                {rec.driveUrl ? (
                  <a className="secondary-action" href={rec.driveUrl} rel="noreferrer" target="_blank">
                    <ExternalLink size={14} />
                    <span>Ver en Drive</span>
                  </a>
                ) : null}
                <Link className="text-link" href={detailUrl}>
                  Detalles del encuentro
                </Link>
              </div>
            </article>
          );
        })}
      </div>
    </section>
  );
}
