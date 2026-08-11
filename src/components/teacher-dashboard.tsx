import { ArrowRight, CalendarDays, CalendarPlus, Clock3, Video } from "lucide-react";
import type { Session } from "next-auth";
import Link from "next/link";
import { CopyMeetLinkButton } from "./copy-meet-link-button";
import { MeetIntegrationStatus } from "./meet-integration-status";
import { db } from "@/src/lib/db";
import { formatDate, formatShortDate, formatTime } from "@/src/lib/ui/format";

export async function TeacherDashboard({ user }: Readonly<{ user: Session["user"] }>) {
  const now = new Date();
  const weekEnd = new Date(now.getTime() + 7 * 24 * 60 * 60 * 1000);
  const meetings = await db.instanciaSala.findMany({
    where: {
      estado: "PROGRAMADA",
      finProgramadoAt: { gte: now },
      solicitud: { docentePrograma: { docente: { usuarioId: user.id } } }
    },
    orderBy: { inicioProgramadoAt: "asc" },
    take: 10,
    include: {
      solicitud: { include: { docentePrograma: { include: { programa: true } } } },
      eventosProveedor: { include: { proveedor: true, cuentaProveedor: true } },
      asignaciones: {
        where: { estado: { in: ["ASIGNADO", "ACEPTADO"] } },
        include: { asistenteTecnico: { include: { usuario: true } } },
        take: 1
      }
    }
  });
  const nextWeek = meetings.filter(({ inicioProgramadoAt }) => inicioProgramadoAt < weekEnd).length;
  const pendingMeet = meetings.filter(({ eventosProveedor }) =>
    eventosProveedor.some(({ proveedor, estadoIntegracion }) =>
      proveedor.tipo === "GOOGLE_MEET" && estadoIntegracion !== "SINCRONIZADA"
    )
  ).length;

  return (
    <div className="role-dashboard teacher-dashboard">
      <header className="role-dashboard-hero">
        <div>
          <p className="page-eyebrow">{formatShortDate(now)}</p>
          <h1>Mis reuniones</h1>
          <p>Próximas clases y actividades asociadas a tus programas.</p>
        </div>
        <div className="role-dashboard-actions">
          <Link className="secondary-action" href="/reuniones">Ver agenda</Link>
          <Link className="primary-action" href="/reuniones/nueva"><CalendarPlus size={17} />Nueva reunión</Link>
        </div>
      </header>

      <section className="role-metrics" aria-label="Resumen de reuniones">
        <article><CalendarDays size={20} /><span><small>Próximas</small><strong>{meetings.length}</strong></span></article>
        <article><Clock3 size={20} /><span><small>En los próximos 7 días</small><strong>{nextWeek}</strong></span></article>
        <article className={pendingMeet ? "is-warning" : ""}><Video size={20} /><span><small>Meet pendientes</small><strong>{pendingMeet}</strong></span></article>
      </section>

      <section className="content-section dashboard-table-section">
        <div className="section-heading">
          <div><h2>Próximas reuniones</h2><p>Tu agenda docente ordenada cronológicamente.</p></div>
          <Link className="text-link" href="/reuniones">Agenda completa <ArrowRight size={16} /></Link>
        </div>
        {meetings.length === 0 ? (
          <div className="empty-state"><CalendarDays size={24} /><p>No tenés reuniones próximas.</p></div>
        ) : (
          <div className="table-wrap">
            <table className="data-table role-meetings-table">
              <thead><tr><th>Fecha</th><th>Hora</th><th>Reunión</th><th>Programa</th><th>Meet</th><th>Asistencia técnica</th></tr></thead>
              <tbody>{meetings.map((meeting) => {
                const meet = meeting.eventosProveedor.find(({ proveedor }) => proveedor.tipo === "GOOGLE_MEET");
                const assistant = meeting.asignaciones[0]?.asistenteTecnico.usuario;
                return (
                  <tr key={meeting.id}>
                    <td className="date-cell">{formatDate(meeting.inicioProgramadoAt)}</td>
                    <td className="time-cell">{formatTime(meeting.inicioProgramadoAt)}</td>
                    <td><Link className="meeting-title-link" href={`/reuniones/${meeting.solicitud.id}`}>{meeting.solicitud.titulo}</Link></td>
                    <td>{meeting.solicitud.docentePrograma.programa.nombre}</td>
                    <td><strong>{meet?.cuentaProveedor?.nombre ?? "Sin sala"}</strong><small><MeetIntegrationStatus status={meet?.estadoIntegracion} /></small>{meet?.joinUrl ? <CopyMeetLinkButton url={meet.joinUrl} /> : null}</td>
                    <td>{assistant ? `${assistant.nombres} ${assistant.apellidos ?? ""}`.trim() : meeting.requiereAsistenciaTecnica ? <span className="status status-warning">Pendiente</span> : <span className="muted-text">No requiere</span>}</td>
                  </tr>
                );
              })}</tbody>
            </table>
          </div>
        )}
      </section>
    </div>
  );
}
