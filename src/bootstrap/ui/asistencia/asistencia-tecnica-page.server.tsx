import { ArrowRight, CalendarClock, Search, UserRoundCheck, UsersRound } from "lucide-react";
import Link from "next/link";
import { redirect } from "next/navigation";
import { auth } from "@/auth";
import { BulkMonitoringNotificationActions } from "@/src/modules/asistencia/presentation/components/bulk-monitoring-notification-actions";
import { MeetLinkActions } from "@/src/components/copy-meet-link-button";
import { resolveSessionActor } from "@/src/lib/auth/session-actor.adapter";
import { db } from "@/src/lib/db";
import { seleccionarEventoProveedorActivo } from "@/src/modules/reuniones/evento-proveedor-activo.domain";
import { agruparPorDia, colorCuentaZoom, nombreCuentaZoom } from "@/src/modules/reuniones/lista-zoom-agrupacion.domain";
import { formatDate, formatTime } from "@/src/lib/ui/format";

const ACTIVE_ASSIGNMENTS = ["ASIGNADO", "ACEPTADO"] as const;

export default async function AsistenciaTecnicaPage({
  searchParams
}: Readonly<{ searchParams: Promise<{ estado?: string; q?: string }> }>) {
  const session = await auth();
  if (!session?.user) redirect("/acceso");
  const actor = await resolveSessionActor(db, { id: session.user.id, email: session.user.email });
  if (!actor?.activo || actor.rol !== "ADMINISTRACION") redirect("/reuniones");

  const { estado = "todas", q = "" } = await searchParams;
  const now = new Date();
  const meetings = await db.instanciaSala.findMany({
      where: {
        requiereAsistenciaTecnica: true,
        inicioProgramadoAt: { gte: now },
        estado: "PROGRAMADA",
        solicitud: q
          ? {
              OR: [
                { titulo: { contains: q, mode: "insensitive" } },
                {
                  docentePrograma: {
                    programa: { nombre: { contains: q, mode: "insensitive" } }
                  }
                },
                {
                  docentePrograma: {
                    docente: {
                      usuario: {
                        OR: [
                          { nombres: { contains: q, mode: "insensitive" } },
                          { apellidos: { contains: q, mode: "insensitive" } }
                        ]
                      }
                    }
                  }
                }
              ]
            }
          : undefined
      },
      orderBy: [{ inicioProgramadoAt: "asc" }, { id: "asc" }],
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
        asignaciones: {
          where: { estado: { in: [...ACTIVE_ASSIGNMENTS] } },
          include: { asistenteTecnico: { include: { usuario: true } } },
          orderBy: { updatedAt: "desc" }
        },
        postulaciones: {
          where: {
            estado: "ME_INTERESA",
            asistenteTecnico: { cesadoHastaProximoInicioSesion: false }
          },
          include: { asistenteTecnico: { include: { usuario: true } } },
          orderBy: { createdAt: "asc" }
        },
        eventosProveedor: {
          include: { proveedor: true, cuentaProveedor: true }
        }
      }
  });

  const rows = meetings
    .map((meeting) => {
      const assignment = meeting.asignaciones[0] ?? null;
      return {
        meeting,
        assignment,
        covered: Boolean(assignment)
      };
    })
    .filter(({ covered }) => estado === "pendientes" ? !covered : estado === "cubiertas" ? covered : true);

  const total = meetings.length;
  const covered = meetings.filter(({ asignaciones }) => asignaciones.length > 0).length;
  const pending = total - covered;
  const days = agruparPorDia(rows, ({ meeting }) => meeting.inicioProgramadoAt, now);

  return (
    <>
      <header className="page-header">
        <div>
          <p className="page-eyebrow">Monitoreo</p>
          <h1>Reuniones para seguimiento</h1>
          <p>Controlá la cobertura y el estado de las reuniones.</p>
        </div>
        <UserRoundCheck size={28} color="var(--brand)" aria-hidden="true" />
      </header>

      <nav className="monitoring-view-tabs" aria-label="Secciones de monitoreo">
        <Link className="is-active" href="/monitoreo">Reuniones</Link>
        <Link href="/monitoreo/gestion">Gestión</Link>
      </nav>
      <section className="metric-grid coverage-stats" aria-label="Resumen de cobertura">
        <div className="stat"><span>Total futuro</span><strong>{total}</strong></div>
        <div className="stat"><span>Cubiertas</span><strong>{covered}</strong></div>
        <div className="stat"><span>Pendientes</span><strong>{pending}</strong></div>
      </section>

      <BulkMonitoringNotificationActions
        pendingCount={pending}
        coveredCount={covered}
      />

      <form className="filter-bar coverage-filter" method="get">
        <Search size={18} aria-hidden="true" />
        <input
          aria-label="Buscar instancias"
          defaultValue={q}
          name="q"
          placeholder="Buscar por reunión, programa o docente"
          type="search"
        />
        <select aria-label="Filtrar estado" name="estado" defaultValue={estado}>
          <option value="todas">Todas</option>
          <option value="pendientes">Pendientes</option>
          <option value="cubiertas">Cubiertas</option>
        </select>
        <button className="secondary-action" type="submit">Filtrar</button>
      </form>

      <section className="coverage-results" aria-label="Reuniones que requieren monitoreo">
        {rows.length === 0 ? (
          <div className="content-section empty-state"><UserRoundCheck size={24} aria-hidden="true" /><p>No hay instancias para ese filtro.</p></div>
        ) : (
          <div className="coverage-card-list">
            {days.map((day) => <section className="monitoring-day-group" key={day.clave} aria-labelledby={`monitoring-day-${day.clave}`}>
              <h2 className="monitoring-day-title" id={`monitoring-day-${day.clave}`}>
                {day.relativo === "HOY" ? <span className="monitoring-day-relative">Hoy</span> : day.relativo === "MANANA" ? <span className="monitoring-day-relative">Mañana</span> : null}
                {day.etiqueta} <small>{day.items.length} {day.items.length === 1 ? "reunión" : "reuniones"}</small>
              </h2>
              <div className="monitoring-day-cards">{day.items.map(({ meeting, assignment, covered }) => {
                  const association = meeting.solicitud.docentePrograma;
                  const event = seleccionarEventoProveedorActivo(meeting);
                  const isZoom = event?.proveedor.tipo === "ZOOM" || event?.proveedor.tipo === "ZOOM_HISTORICO";
                  const hostEmail = isZoom ? event?.cuentaProveedor?.emailOrganizador : null;
                  const hostColor = colorCuentaZoom(hostEmail);
                  const assistantName = assignment
                    ? [assignment.asistenteTecnico.usuario.nombres, assignment.asistenteTecnico.usuario.apellidos].filter(Boolean).join(" ")
                    : null;
                  const modalidad = meeting.modalidadOverride ?? meeting.solicitud.modalidad;
                  const inicioAsistencia = meeting.inicioAsistenciaTecnicaAt ?? meeting.inicioProgramadoAt;
                  const finAsistencia = meeting.finAsistenciaTecnicaAt ?? meeting.finProgramadoAt;
                  const applicantsCount = meeting.postulaciones.length;
                  return (
                    <article className={`coverage-card monitoring-account-card ${covered ? "is-covered" : "is-pending"}`} data-cuenta={hostColor ?? "sin"} key={meeting.id}>
                      <header className="coverage-card-header">
                        <div className="coverage-date">
                          <CalendarClock size={18} />
                          <span>
                            <strong>{formatDate(inicioAsistencia)}</strong>
                            <small>{formatTime(inicioAsistencia)}–{formatTime(finAsistencia)} h</small>
                          </span>
                        </div>
                        <span className={`status ${covered ? "status-ok" : "status-warning"}`}>
                          {covered ? "Cobertura asignada" : "Cobertura pendiente"}
                        </span>
                      </header>

                      <div className="coverage-card-body">
                        <div className="coverage-meeting-copy">
                          <span className={`monitoring-platform ${isZoom ? "is-zoom" : "is-meet"}`}>{isZoom ? "Zoom" : event ? "Google Meet" : "Sin plataforma"}</span>
                          <p className="coverage-card-eyebrow">{association.programa.nombre}</p>
                          <Link className="coverage-title-link" href={`/reuniones/${meeting.solicitud.id}`}>{meeting.solicitud.titulo}</Link>
                          <div className="coverage-meeting-meta">
                            <span><strong>Docente</strong>{association.docente.usuario.nombres} {association.docente.usuario.apellidos}</span>
                            <span><strong>Modalidad</strong>{modalidad === "HIBRIDA" ? "Híbrida" : "Virtual"}</span>
                            {modalidad === "HIBRIDA" ? (
                              <span><strong>Horario de reunión</strong>{formatTime(meeting.inicioProgramadoAt)}–{formatTime(meeting.finProgramadoAt)}</span>
                            ) : null}
                            <span><strong>{isZoom ? "Host de Zoom" : "Cuenta de Meet"}</strong>{event?.cuentaProveedor ? `${isZoom && hostEmail ? nombreCuentaZoom(hostEmail) : event.cuentaProveedor.nombre}${event.cuentaProveedor.emailOrganizador ? ` · ${event.cuentaProveedor.emailOrganizador}` : ""}` : "Sin cuenta host asignada"}</span>
                          </div>
                          {isZoom && event ? <div className="monitoring-zoom-identifiers">
                            <span><strong>N.º de reunión</strong> {event.codigoReunion ?? event.externalEventId ?? "No disponible"}</span>
                          </div> : null}
                          <div className="coverage-interest-summary">
                            <UsersRound size={17} />
                            <strong>{applicantsCount}</strong> {applicantsCount === 1 ? "persona postulada" : "personas postuladas"}
                          </div>
                        </div>

                      </div>

                      <footer className="coverage-card-footer">
                        <div className="coverage-quick-links">
                          {event?.joinUrl ? (
                            <MeetLinkActions url={event.joinUrl} provider={isZoom ? "ZOOM" : "GOOGLE_MEET"} />
                          ) : <span className="muted-text">Enlace pendiente</span>}
                          <Link className="text-link" href={`/reuniones/${meeting.solicitud.id}`}>Ver detalle <ArrowRight size={15} /></Link>
                        </div>
                        <div className="coverage-management-link">
                          <span>{assistantName ? `Asignada a ${assistantName}` : "Sin persona asignada"}</span>
                          <Link className="secondary-action" href={`/monitoreo/gestionar/${meeting.id}`}>
                            Gestionar monitoreo <ArrowRight size={16} aria-hidden="true" />
                          </Link>
                        </div>
                      </footer>
                    </article>
                  );
                })}</div></section>)}
          </div>
        )}
      </section>
    </>
  );
}
