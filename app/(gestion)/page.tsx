import { AlertTriangle, ArrowRight, CalendarPlus, Video } from "lucide-react";
import Link from "next/link";
import { redirect } from "next/navigation";
import { auth } from "@/auth";
import {
  MeetIntegrationStatus,
  MeetPendingNotice
} from "@/src/components/meet-integration-status";
import { db } from "@/src/lib/db";
import { formatDateTime, formatShortDate } from "@/src/lib/ui/format";
import { AssistantDashboard } from "@/src/components/assistant-dashboard";

export default async function HomePage() {
  const session = await auth();
  if (!session?.user) redirect("/acceso");
  if (session.user.role === "ASISTENTE") return <AssistantDashboard user={session.user} />;
  const now = new Date();
  const weekEnd = new Date(now.getTime() + 7 * 24 * 60 * 60 * 1000);
  const docenteWhere =
    session?.user.role === "DOCENTE"
      ? { solicitud: { docentePrograma: { docente: { usuarioId: session.user.id } } } }
      : {};

  const [openRequests, weekMeetings, pendingAssistance, zoomHistory, upcoming] =
    await Promise.all([
      db.solicitudSala.count({
        where: {
          estado: { in: ["REGISTRADA", "PROVISIONANDO", "REQUIERE_REVISION"] },
          ...(session?.user.role === "DOCENTE"
            ? { docentePrograma: { docente: { usuarioId: session.user.id } } }
            : {})
        }
      }),
      db.instanciaSala.count({
        where: {
          ...docenteWhere,
          inicioProgramadoAt: { gte: now, lt: weekEnd },
          estado: "PROGRAMADA"
        }
      }),
      db.instanciaSala.count({
        where: {
          ...docenteWhere,
          requiereAsistencia: true,
          inicioProgramadoAt: { gte: now },
          estado: "PROGRAMADA",
          asignaciones: { none: { estado: { in: ["ASIGNADO", "ACEPTADO"] } } }
        }
      }),
      session.user.role === "ADMINISTRACION"
        ? db.eventoProveedor.count({ where: { proveedor: { tipo: "ZOOM_HISTORICO" } } })
        : Promise.resolve(null),
      db.instanciaSala.findMany({
        where: {
          ...docenteWhere,
          inicioProgramadoAt: { gte: now },
          estado: "PROGRAMADA"
        },
        orderBy: { inicioProgramadoAt: "asc" },
        take: 6,
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
          eventosProveedor: {
            include: { proveedor: true, cuentaProveedor: true }
          },
          asignaciones: {
            where: { estado: { in: ["ASIGNADO", "ACEPTADO"] } },
            include: { asistente: { include: { usuario: true } } }
          }
        }
      })
    ]);

  const metrics = [
    { label: "Solicitudes abiertas", value: openRequests },
    { label: "Próximos 7 días", value: weekMeetings },
    { label: "Sin asistencia", value: pendingAssistance, alert: pendingAssistance > 0 },
    ...(zoomHistory === null ? [] : [{ label: "Histórico Zoom", value: zoomHistory }])
  ];
  const hasPendingMeet = upcoming.some((meeting) =>
    meeting.eventosProveedor.some(
      ({ proveedor, estadoIntegracion }) =>
        proveedor.tipo === "GOOGLE_MEET" && estadoIntegracion === "PENDIENTE"
    )
  );

  return (
    <>
      <header className="page-header">
        <div>
          <p className="page-eyebrow">{formatShortDate(now)}</p>
          <h1>Resumen operativo</h1>
          <p>Reuniones, asistencia y disponibilidad de salas.</p>
        </div>
        <Link className="primary-action" href="/reuniones/nueva">
          <CalendarPlus size={18} aria-hidden="true" />
          Nueva reunión
        </Link>
      </header>

      <section className="metric-grid" aria-label="Indicadores">
        {metrics.map((metric) => (
          <article
            className={"alert" in metric && metric.alert ? "stat alert-stat" : "stat"}
            key={metric.label}
          >
            <span>{metric.label}</span>
            <strong>{metric.value}</strong>
          </article>
        ))}
      </section>

      <section className="content-section">
        <div className="section-heading">
          <div>
            <h2>Próximas reuniones</h2>
            <p>Ordenadas por fecha y hora.</p>
          </div>
          <Link className="text-link" href="/reuniones">
            Ver agenda <ArrowRight size={16} aria-hidden="true" />
          </Link>
        </div>

        {hasPendingMeet ? <MeetPendingNotice /> : null}

        {upcoming.length === 0 ? (
          <div className="empty-state">
            <Video size={24} aria-hidden="true" />
            <p>No hay reuniones próximas.</p>
          </div>
        ) : (
          <div className="table-wrap">
            <table className="data-table">
              <thead>
                <tr>
                  <th>Fecha</th>
                  <th>Reunión</th>
                  <th>Programa</th>
                  <th>Sala / Meet</th>
                  <th>Asistencia</th>
                </tr>
              </thead>
              <tbody>
                {upcoming.map((meeting) => {
                  const association = meeting.solicitud.docentePrograma;
                  const meetEvent = meeting.eventosProveedor.find(
                    ({ proveedor }) => proveedor.tipo === "GOOGLE_MEET"
                  );
                  return (
                    <tr key={meeting.id}>
                      <td className="date-cell">{formatDateTime(meeting.inicioProgramadoAt)}</td>
                      <td>
                        <strong>{meeting.solicitud.titulo}</strong>
                        <small>
                          {association.docente.usuario.nombres}{" "}
                          {association.docente.usuario.apellidos}
                        </small>
                      </td>
                      <td>{association.programa.nombre}</td>
                      <td>
                        <strong>{meetEvent?.cuentaProveedor?.nombre ?? "Sin sala"}</strong>
                        <small>
                          <MeetIntegrationStatus status={meetEvent?.estadoIntegracion} />
                        </small>
                      </td>
                      <td>
                        {meeting.requiereAsistencia && meeting.asignaciones.length === 0 ? (
                          <span className="status status-warning">
                            <AlertTriangle size={14} /> Pendiente
                          </span>
                        ) : meeting.asignaciones[0] ? (
                          <span className="status status-ok">
                            {meeting.asignaciones[0].asistente.usuario.nombres}
                          </span>
                        ) : (
                          <span className="muted-text">No requiere</span>
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </section>
    </>
  );
}
