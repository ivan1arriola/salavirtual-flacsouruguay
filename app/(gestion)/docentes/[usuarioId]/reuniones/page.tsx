import { ArrowLeft, CalendarClock, CalendarDays, History, Settings } from "lucide-react";
import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { auth } from "@/auth";
import { MeetLinkActions } from "@/src/components/copy-meet-link-button";
import { MeetIntegrationStatus } from "@/src/components/meet-integration-status";
import { resolveSessionActor } from "@/src/lib/auth/session-actor.adapter";
import { db } from "@/src/lib/db";
import { formatDate, formatTime } from "@/src/lib/ui/format";

export default async function ReunionesDocentePage({
  params
}: Readonly<{ params: Promise<{ usuarioId: string }> }>) {
  const session = await auth();
  if (!session?.user) redirect("/acceso");
  const actor = await resolveSessionActor(db, { id: session.user.id, email: session.user.email });
  if (!actor?.activo || actor.rol !== "ADMINISTRACION") redirect("/");
  const { usuarioId } = await params;
  const teacher = await db.usuario.findFirst({
    where: { id: usuarioId, rol: "DOCENTE" },
    select: { id: true, nombres: true, apellidos: true, emailPrincipal: true, activo: true }
  });
  if (!teacher) notFound();

  const meetings = await db.instanciaSala.findMany({
    where: { solicitud: { docentePrograma: { docente: { usuarioId: teacher.id } } } },
    orderBy: [{ inicioProgramadoAt: "desc" }, { id: "asc" }],
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
  const now = new Date();
  const upcoming = meetings.filter(({ estado, finProgramadoAt }) => estado === "PROGRAMADA" && finProgramadoAt >= now).length;
  const past = meetings.filter(({ finProgramadoAt }) => finProgramadoAt < now).length;
  const programs = new Set(meetings.map(({ solicitud }) => solicitud.docentePrograma.programa.id)).size;
  const teacherName = [teacher.nombres, teacher.apellidos].filter(Boolean).join(" ");

  return (
    <div className="teacher-meetings-page">
      <Link className="back-link" href="/reuniones"><ArrowLeft size={16} />Agenda</Link>
      <header className="teacher-meetings-hero">
        <div>
          <p className="page-eyebrow">Agenda docente</p>
          <h1>{teacherName}</h1>
          <p>{teacher.emailPrincipal ?? "Sin correo principal"} · {teacher.activo ? "Usuario activo" : "Usuario inactivo"}</p>
        </div>
        <Link className="secondary-action" href={`/usuarios/${teacher.id}`}><Settings size={16} />Gestionar docente</Link>
      </header>

      <section className="role-metrics teacher-meeting-metrics" aria-label="Resumen del docente">
        <article><CalendarDays size={20} /><span><small>Total de encuentros</small><strong>{meetings.length}</strong></span></article>
        <article><CalendarClock size={20} /><span><small>Próximos</small><strong>{upcoming}</strong></span></article>
        <article><History size={20} /><span><small>Históricos</small><strong>{past}</strong></span></article>
        <article><CalendarDays size={20} /><span><small>Programas</small><strong>{programs}</strong></span></article>
      </section>

      <section className="content-section dashboard-table-section">
        <div className="section-heading">
          <div><h2>Todas las reuniones</h2><p>Próximas e históricas, ordenadas desde la más reciente.</p></div>
        </div>
        {meetings.length === 0 ? (
          <div className="empty-state"><CalendarDays size={24} /><p>Este docente todavía no tiene reuniones.</p></div>
        ) : (
          <div className="table-wrap">
            <table className="data-table teacher-history-table">
              <thead><tr><th>Fecha</th><th>Hora</th><th>Reunión</th><th>Programa</th><th>Estado</th><th>Asistencia técnica</th><th>Meet</th></tr></thead>
              <tbody>
                {meetings.map((meeting) => {
                  const meet = meeting.eventosProveedor.find(({ proveedor }) => proveedor.tipo === "GOOGLE_MEET");
                  const assistant = meeting.asignaciones[0]?.asistenteTecnico.usuario;
                  return (
                    <tr key={meeting.id}>
                      <td className="date-cell">{formatDate(meeting.inicioProgramadoAt)}</td>
                      <td className="time-cell">{formatTime(meeting.inicioProgramadoAt)}</td>
                      <td><Link className="meeting-title-link" href={`/reuniones/${meeting.solicitud.id}`}>{meeting.solicitud.titulo}</Link><small>{(meeting.modalidadOverride ?? meeting.solicitud.modalidad) === "HIBRIDA" ? "Híbrida" : "Virtual"}</small></td>
                      <td>{meeting.solicitud.docentePrograma.programa.nombre}</td>
                      <td><span className={`status status-${statusTone(meeting.estado)}`}>{statusLabel(meeting.estado)}</span></td>
                      <td>{assistant ? `${assistant.nombres} ${assistant.apellidos ?? ""}`.trim() : meeting.requiereAsistenciaTecnica ? <span className="status status-warning">Pendiente</span> : <span className="muted-text">No requiere</span>}</td>
                      <td>
                        <small><MeetIntegrationStatus status={meet?.estadoIntegracion} hasMeet={Boolean(meet?.joinUrl)} /></small>
                        {meet?.joinUrl ? <MeetLinkActions iconOnly openClassName="icon-link" url={meet.joinUrl} /> : null}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </section>
    </div>
  );
}

function statusTone(status: string): string {
  if (status === "CANCELADA" || status === "NO_REALIZADA") return "error";
  if (status === "FINALIZADA") return "neutral";
  return "ok";
}

function statusLabel(status: string): string {
  const labels: Readonly<Record<string, string>> = {
    PROGRAMADA: "Programada",
    FINALIZADA: "Finalizada",
    CANCELADA: "Cancelada",
    NO_REALIZADA: "No realizada"
  };
  return labels[status] ?? status.toLowerCase().replaceAll("_", " ");
}