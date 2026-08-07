import {
  ArrowRight,
  CalendarClock,
  CalendarDays,
  CalendarPlus,
  ExternalLink,
  Search,
  UserRoundCheck,
  UserRoundMinus,
  Video
} from "lucide-react";
import Link from "next/link";
import { redirect } from "next/navigation";
import { auth } from "@/auth";
import { MeetIntegrationStatus, MeetPendingNotice } from "@/src/components/meet-integration-status";
import { resolveSessionActor } from "@/src/lib/auth/session-actor.adapter";
import { db } from "@/src/lib/db";
import { formatDate, formatShortDate, formatTime } from "@/src/lib/ui/format";
import { puedeVerAgendaCompleta } from "@/src/modules/reuniones/reuniones.domain";

const ACTIVE_ASSIGNMENTS = ["ASIGNADO", "ACEPTADO"] as const;

export default async function ReunionesPage({
  searchParams
}: Readonly<{ searchParams: Promise<{ q?: string }> }>) {
  const session = await auth();
  if (!session?.user) redirect("/acceso");
  const actor = await resolveSessionActor(db, { id: session.user.id, email: session.user.email });
  if (!actor?.activo || !puedeVerAgendaCompleta(actor.rol)) redirect("/mi-agenda");

  const { q = "" } = await searchParams;
  const now = new Date();
  const teacherFilter = actor.rol === "DOCENTE"
    ? { docentePrograma: { docente: { usuarioId: actor.id } } }
    : {};
  const meetings = await db.instanciaSala.findMany({
    where: {
      finProgramadoAt: { gte: now },
      estado: { not: "CANCELADA" },
      solicitud: {
        ...teacherFilter,
        ...(q ? {
          OR: [
            { titulo: { contains: q, mode: "insensitive" as const } },
            { docentePrograma: { programa: { nombre: { contains: q, mode: "insensitive" as const } } } },
            { docentePrograma: { docente: { usuario: {
              OR: [
                { nombres: { contains: q, mode: "insensitive" as const } },
                { apellidos: { contains: q, mode: "insensitive" as const } }
              ]
            } } } }
          ]
        } : {})
      }
    },
    orderBy: { inicioProgramadoAt: "asc" },
    take: 100,
    include: {
      solicitud: {
        include: {
          docentePrograma: {
            include: { programa: true, docente: { include: { usuario: true } } }
          }
        }
      },
      eventosProveedor: { include: { proveedor: true, cuentaProveedor: true } },
      asignaciones: {
        where: { estado: { in: [...ACTIVE_ASSIGNMENTS] } },
        include: { asistente: { include: { usuario: true } } },
        orderBy: { updatedAt: "desc" },
        take: 1
      }
    }
  });

  const todayStart = startOfMontevideoDay(now);
  const todayEnd = new Date(todayStart.getTime() + 24 * 60 * 60 * 1000);
  const weekEnd = new Date(now.getTime() + 7 * 24 * 60 * 60 * 1000);
  const today = meetings.filter(({ inicioProgramadoAt }) => inicioProgramadoAt >= todayStart && inicioProgramadoAt < todayEnd).length;
  const nextWeek = meetings.filter(({ inicioProgramadoAt }) => inicioProgramadoAt < weekEnd).length;
  const pendingAssistance = meetings.filter(({ requiereAsistencia, asignaciones }) => requiereAsistencia && asignaciones.length === 0).length;
  const hasPendingMeet = meetings.some(({ eventosProveedor }) =>
    eventosProveedor.some(({ proveedor, estadoIntegracion }) => proveedor.tipo === "GOOGLE_MEET" && estadoIntegracion === "PENDIENTE")
  );

  return (
    <div className="meetings-agenda-page">
      <header className="meetings-agenda-hero">
        <div>
          <p className="page-eyebrow">{formatShortDate(now)}</p>
          <h1>Agenda de reuniones</h1>
          <p>{actor.rol === "DOCENTE" ? "Tus próximas reuniones y accesos." : "Próximas reuniones, responsables y cobertura operativa."}</p>
        </div>
        <Link className="primary-action" href="/reuniones/nueva"><CalendarPlus size={18} />Nueva reunión</Link>
      </header>

      <section className="agenda-summary-grid" aria-label="Resumen de agenda">
        <article><CalendarDays size={19} /><span><small>Próximas</small><strong>{meetings.length}</strong></span></article>
        <article><CalendarClock size={19} /><span><small>Hoy</small><strong>{today}</strong></span></article>
        <article><CalendarDays size={19} /><span><small>Próximos 7 días</small><strong>{nextWeek}</strong></span></article>
        <article className={pendingAssistance ? "is-warning" : ""}><UserRoundCheck size={19} /><span><small>Sin cobertura</small><strong>{pendingAssistance}</strong></span></article>
      </section>

      <form className="filter-bar agenda-search" method="get">
        <Search size={18} aria-hidden="true" />
        <input aria-label="Buscar reuniones" defaultValue={q} name="q" placeholder="Buscar por reunión, programa o docente" type="search" />
        <button className="secondary-action" type="submit">Buscar</button>
      </form>

      {hasPendingMeet ? <MeetPendingNotice /> : null}

      <section className="agenda-meeting-list" aria-label="Próximas reuniones">
        {meetings.length === 0 ? (
          <div className="content-section empty-state"><CalendarDays size={24} /><p>No hay reuniones que coincidan con la búsqueda.</p></div>
        ) : meetings.map((meeting) => {
          const association = meeting.solicitud.docentePrograma;
          const teacher = association.docente.usuario;
          const event = meeting.eventosProveedor.find(({ proveedor }) => proveedor.tipo === "GOOGLE_MEET") ?? meeting.eventosProveedor[0];
          const assignment = meeting.asignaciones[0];
          const assistant = assignment?.asistente.usuario;
          const assistantName = assistant ? [assistant.nombres, assistant.apellidos].filter(Boolean).join(" ") : null;
          return (
            <article className="agenda-meeting-card" key={meeting.id}>
              <header className="agenda-meeting-card-header">
                <div className="agenda-meeting-date">
                  <span>{formatDate(meeting.inicioProgramadoAt)}</span>
                  <strong>{formatTime(meeting.inicioProgramadoAt)}–{formatTime(meeting.finProgramadoAt)}</strong>
                </div>
                <span className={`status status-${statusTone(meeting.estado)}`}>{statusLabel(meeting.estado)}</span>
              </header>

              <div className="agenda-meeting-card-body">
                <div className="agenda-meeting-primary">
                  <p className="agenda-program-label">{association.programa.nombre}</p>
                  <Link className="agenda-meeting-title" href={`/reuniones/${meeting.solicitud.id}`}>{meeting.solicitud.titulo}</Link>
                  <div className="agenda-teacher-line">
                    <span>Docente</span>
                    {actor.rol === "ADMINISTRACION" ? (
                      <Link className="teacher-meetings-link" href={`/docentes/${teacher.id}/reuniones`}>{teacher.nombres} {teacher.apellidos}</Link>
                    ) : <strong>{teacher.nombres} {teacher.apellidos}</strong>}
                  </div>
                </div>

                <div className="agenda-meeting-logistics">
                  <div><span>Modalidad</span><strong>{meeting.solicitud.modalidad === "HIBRIDA" ? "Híbrida" : "Virtual"}</strong></div>
                  <div><span>Sala Meet</span><strong>{event?.cuentaProveedor?.nombre ?? "Sin sala"}</strong><MeetIntegrationStatus status={event?.estadoIntegracion} /></div>
                </div>

                <div className={`agenda-assistant ${assistantName ? "has-assistant" : meeting.requiereAsistencia ? "needs-assistant" : "no-assistance"}`}>
                  {meeting.requiereAsistencia ? <UserRoundCheck size={20} /> : <UserRoundMinus size={20} />}
                  <span>
                    <small>Asistencia</small>
                    <strong>{assistantName ?? (meeting.requiereAsistencia ? "Pendiente de asignación" : "No requiere")}</strong>
                    {assignment ? <em>{assignment.estado === "ACEPTADO" ? "Confirmada" : "Asignada"}</em> : null}
                  </span>
                </div>
              </div>

              <footer className="agenda-meeting-card-footer">
                <Link className="text-link" href={`/reuniones/${meeting.solicitud.id}`}>Ver detalle <ArrowRight size={15} /></Link>
                {event?.joinUrl ? (
                  <a className="secondary-action agenda-meet-action" href={event.joinUrl} rel="noreferrer" target="_blank"><Video size={16} />Abrir Meet<ExternalLink size={13} /></a>
                ) : <span className="muted-text">Enlace Meet pendiente</span>}
              </footer>
            </article>
          );
        })}
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
    EN_CURSO: "En curso",
    FINALIZADA: "Finalizada",
    CANCELADA: "Cancelada",
    NO_REALIZADA: "No realizada"
  };
  return labels[status] ?? status.toLowerCase().replaceAll("_", " ");
}

function startOfMontevideoDay(date: Date): Date {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: "America/Montevideo",
    year: "numeric",
    month: "2-digit",
    day: "2-digit"
  }).formatToParts(date);
  const value = (type: "year" | "month" | "day") => parts.find((part) => part.type === type)?.value;
  return new Date(`${value("year")}-${value("month")}-${value("day")}T00:00:00-03:00`);
}
