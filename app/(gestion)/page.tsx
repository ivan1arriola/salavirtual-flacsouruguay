import {
  AlertTriangle,
  ArrowRight,
  CalendarClock,
  CalendarDays,
  CalendarPlus,
  CircleAlert,
  ClipboardList,
  UserRoundCheck
} from "lucide-react";
import Link from "next/link";
import { redirect } from "next/navigation";
import { auth } from "@/auth";
import { AssistantDashboard } from "@/src/components/assistant-dashboard";
import { CopyMeetLinkButton } from "@/src/components/copy-meet-link-button";
import { MeetIntegrationStatus, MeetPendingNotice } from "@/src/components/meet-integration-status";
import { TeacherDashboard } from "@/src/components/teacher-dashboard";
import { db } from "@/src/lib/db";
import { formatDate, formatShortDate, formatTime } from "@/src/lib/ui/format";

export default async function HomePage() {
  const session = await auth();
  if (!session?.user) redirect("/acceso");
  if (session.user.role === "ASISTENTE") return <AssistantDashboard user={session.user} />;
  if (session.user.role === "DOCENTE") return <TeacherDashboard user={session.user} />;

  const now = new Date();
  const todayStart = startOfMontevideoDay(now);
  const todayEnd = new Date(todayStart.getTime() + 24 * 60 * 60 * 1000);
  const weekEnd = new Date(now.getTime() + 7 * 24 * 60 * 60 * 1000);
  const [openRequests, todayMeetings, weekMeetings, pendingAssistance, integrationErrors, upcoming] =
    await Promise.all([
      db.solicitudSala.count({
        where: { estado: { in: ["REGISTRADA", "PROVISIONANDO", "REQUIERE_REVISION"] } }
      }),
      db.instanciaSala.count({
        where: {
          inicioProgramadoAt: { gte: todayStart, lt: todayEnd },
          estado: "PROGRAMADA"
        }
      }),
      db.instanciaSala.count({
        where: {
          inicioProgramadoAt: { gte: now, lt: weekEnd },
          estado: "PROGRAMADA"
        }
      }),
      db.instanciaSala.count({
        where: {
          requiereAsistencia: true,
          inicioProgramadoAt: { gte: now },
          estado: "PROGRAMADA",
          asignaciones: { none: { estado: { in: ["ASIGNADO", "ACEPTADO"] } } }
        }
      }),
      db.eventoProveedor.count({
        where: {
          proveedor: { tipo: "GOOGLE_MEET" },
          estadoIntegracion: "ERROR",
          instancia: { inicioProgramadoAt: { gte: now }, estado: "PROGRAMADA" }
        }
      }),
      db.instanciaSala.findMany({
        where: { inicioProgramadoAt: { gte: now }, estado: "PROGRAMADA" },
        orderBy: { inicioProgramadoAt: "asc" },
        take: 8,
        include: {
          solicitud: {
            include: {
              docentePrograma: {
                include: {
                  programa: true,
                  docente: { include: { usuario: true } }
                }
              }
            }
          },
          eventosProveedor: { include: { proveedor: true, cuentaProveedor: true } },
          asignaciones: {
            where: { estado: { in: ["ASIGNADO", "ACEPTADO"] } },
            include: { asistente: { include: { usuario: true } } },
            take: 1
          }
        }
      })
    ]);

  const metrics = [
    { label: "Solicitudes abiertas", value: openRequests, copy: "En registro o provisión", icon: ClipboardList, tone: "neutral" },
    { label: "Reuniones de hoy", value: todayMeetings, copy: "Programadas para hoy", icon: CalendarClock, tone: "brand" },
    { label: "Próximos 7 días", value: weekMeetings, copy: "Carga operativa semanal", icon: CalendarDays, tone: "brand" },
    { label: "Sin asistencia", value: pendingAssistance, copy: "Necesitan cobertura", icon: UserRoundCheck, tone: pendingAssistance ? "warning" : "ok" },
    { label: "Errores de Meet", value: integrationErrors, copy: "Requieren intervención", icon: CircleAlert, tone: integrationErrors ? "danger" : "ok" }
  ] as const;
  const hasPendingMeet = upcoming.some((meeting) =>
    meeting.eventosProveedor.some(({ proveedor, estadoIntegracion }) =>
      proveedor.tipo === "GOOGLE_MEET" && estadoIntegracion === "PENDIENTE"
    )
  );

  return (
    <div className="role-dashboard admin-dashboard">
      <header className="role-dashboard-hero admin-dashboard-hero">
        <div>
          <p className="page-eyebrow">{formatShortDate(now)}</p>
          <h1>Resumen operativo</h1>
          <p>Lo próximo y lo que requiere atención de Administración.</p>
        </div>
        <div className="role-dashboard-actions">
          <Link className="secondary-action" href="/cobertura-asistencias">Gestionar cobertura</Link>
          <Link className="primary-action" href="/reuniones/nueva"><CalendarPlus size={18} />Nueva reunión</Link>
        </div>
      </header>

      <section className="admin-metric-grid" aria-label="Indicadores operativos">
        {metrics.map(({ label, value, copy, icon: Icon, tone }) => (
          <article className={`admin-metric tone-${tone}`} key={label}>
            <span className="admin-metric-icon"><Icon size={19} /></span>
            <span><small>{label}</small><strong>{value}</strong><em>{copy}</em></span>
          </article>
        ))}
      </section>

      <section className="content-section dashboard-table-section admin-upcoming-section">
        <div className="section-heading">
          <div><h2>Próximas reuniones</h2><p>Información operativa y accesos rápidos.</p></div>
          <Link className="text-link" href="/reuniones">Ver agenda <ArrowRight size={16} /></Link>
        </div>
        {hasPendingMeet ? <MeetPendingNotice /> : null}
        {upcoming.length === 0 ? (
          <div className="empty-state"><CalendarDays size={24} /><p>No hay reuniones próximas.</p></div>
        ) : (
          <div className="table-wrap">
            <table className="data-table admin-upcoming-table">
              <thead>
                <tr><th>Fecha</th><th>Hora</th><th>Reunión</th><th>Programa</th><th>Sala Meet</th><th>Asistencia</th><th>A cargo</th></tr>
              </thead>
              <tbody>
                {upcoming.map((meeting) => {
                  const association = meeting.solicitud.docentePrograma;
                  const teacher = association.docente.usuario;
                  const assignment = meeting.asignaciones[0];
                  const assistant = assignment?.asistente.usuario;
                  const meet = meeting.eventosProveedor.find(({ proveedor }) => proveedor.tipo === "GOOGLE_MEET");
                  const responsible = meeting.solicitud.responsableNombre?.trim() ||
                    `${teacher.nombres} ${teacher.apellidos ?? ""}`.trim();
                  return (
                    <tr key={meeting.id}>
                      <td className="date-cell">{formatDate(meeting.inicioProgramadoAt)}</td>
                      <td className="time-cell">{formatTime(meeting.inicioProgramadoAt)}</td>
                      <td><Link className="meeting-title-link" href={`/reuniones/${meeting.solicitud.id}`}>{meeting.solicitud.titulo}</Link></td>
                      <td>{association.programa.nombre}</td>
                      <td className="meet-room-cell">
                        <strong>{meet?.cuentaProveedor?.nombre ?? "Sin sala"}</strong>
                        <small><MeetIntegrationStatus status={meet?.estadoIntegracion} /></small>
                        {meet?.joinUrl ? <CopyMeetLinkButton url={meet.joinUrl} /> : <span className="muted-text">Link pendiente</span>}
                      </td>
                      <td>
                        {assistant ? (
                          <><span className="status status-ok">{assignment.estado === "ACEPTADO" ? "Confirmada" : "Asignada"}</span><small>{assistant.nombres} {assistant.apellidos}</small></>
                        ) : meeting.requiereAsistencia ? (
                          <span className="status status-warning"><AlertTriangle size={14} />Pendiente</span>
                        ) : <span className="muted-text">No requiere</span>}
                      </td>
                      <td><strong>{responsible}</strong><small>Responsable</small></td>
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

function startOfMontevideoDay(date: Date): Date {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: "America/Montevideo",
    year: "numeric",
    month: "2-digit",
    day: "2-digit"
  }).formatToParts(date);
  const year = parts.find(({ type }) => type === "year")?.value;
  const month = parts.find(({ type }) => type === "month")?.value;
  const day = parts.find(({ type }) => type === "day")?.value;
  return new Date(`${year}-${month}-${day}T00:00:00-03:00`);
}
