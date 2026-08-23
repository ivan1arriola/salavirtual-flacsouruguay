import {
  AlertTriangle,
  ArrowRight,
  CalendarClock,
  CalendarDays,
  CalendarPlus,
  CalendarRange,
  List,
  Search,
  UserRoundCheck,
  UserRoundMinus
} from "lucide-react";
import Link from "next/link";
import { redirect } from "next/navigation";
import { auth } from "@/auth";
import { MeetLinkActions } from "@/src/components/copy-meet-link-button";
import { MeetIntegrationStatus, MeetPendingNotice } from "@/src/components/meet-integration-status";
import { resolveSessionActor } from "@/src/lib/auth/session-actor.adapter";
import { db } from "@/src/lib/db";
import { formatDate, formatShortDate, formatTime } from "@/src/lib/ui/format";
import {
  agruparEncuentrosPorSerie,
  normalizarCodigoReunionBuscado,
  resolverVistaAgenda
} from "@/src/modules/reuniones/agenda-view.domain";
import { puedeVerAgendaCompleta } from "@/src/modules/reuniones/reuniones.domain";
import { listarCasosRevisionDuplicados } from "@/src/modules/reuniones/duplicados.service";

const ACTIVE_ASSIGNMENTS = ["ASIGNADO", "ACEPTADO"] as const;

export default async function ReunionesPage({
  searchParams
}: Readonly<{ searchParams: Promise<{ q?: string; vista?: string; programa?: string }> }>) {
  const session = await auth();
  if (!session?.user) redirect("/acceso");
  const actor = await resolveSessionActor(db, { id: session.user.id, email: session.user.email });
  if (!actor?.activo || !puedeVerAgendaCompleta(actor.rol)) redirect("/mi-agenda");

  const { q = "", vista: vistaParam, programa: programaParam = "" } = await searchParams;
  const vista = resolverVistaAgenda(vistaParam);
  const query = q.trim();
  const programaId = actor.rol === "ADMINISTRACION" ? programaParam.trim() : "";
  const meetingCodeQuery = normalizarCodigoReunionBuscado(query);
  const now = new Date();
  const solicitudFilter = actor.rol === "DOCENTE"
    ? {
        docentePrograma: {
          programa: {
            activo: true,
            docentes: {
              some: {
                activo: true,
                docente: { usuarioId: actor.id }
              }
            }
          }
        }
      }
    : programaId
      ? { docentePrograma: { programaId } }
      : {};

  const [meetings, programs] = await Promise.all([
    db.instanciaSala.findMany({
      where: {
        finProgramadoAt: { gte: now },
        estado: { not: "CANCELADA" },
        solicitud: solicitudFilter,
        ...(query ? {
          OR: [
            {
              eventosProveedor: {
                some: {
                  OR: [
                    { codigoReunion: { contains: meetingCodeQuery, mode: "insensitive" as const } },
                    { joinUrl: { contains: query, mode: "insensitive" as const } }
                  ]
                }
              }
            },
            {
              solicitud: { OR: [
                { titulo: { contains: query, mode: "insensitive" as const } },
                { docentePrograma: { programa: { nombre: { contains: query, mode: "insensitive" as const } } } },
                { docentePrograma: { docente: { usuario: {
                  OR: [
                    { nombres: { contains: query, mode: "insensitive" as const } },
                    { apellidos: { contains: query, mode: "insensitive" as const } }
                  ]
                } } } }
              ] }
            }
          ]
        } : {})
      },
      orderBy: { inicioProgramadoAt: "asc" },
      take: 500,
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
          include: { asistenteTecnico: { include: { usuario: true } } },
          orderBy: { updatedAt: "desc" },
          take: 1
        }
      }
    }),
    actor.rol === "ADMINISTRACION"
      ? db.programa.findMany({
          where: { activo: true },
          orderBy: { nombre: "asc" },
          select: { id: true, nombre: true }
        })
      : Promise.resolve([])
  ]);

  const duplicateCases = actor.rol === "ADMINISTRACION"
    ? await listarCasosRevisionDuplicados(db, now)
    : [];
  const unresolvedDuplicates = duplicateCases.filter(({ decision }) => decision !== "FALSO_POSITIVO");
  const series = agruparEncuentrosPorSerie(meetings);

  const todayStart = startOfMontevideoDay(now);
  const todayEnd = new Date(todayStart.getTime() + 24 * 60 * 60 * 1000);
  const weekEnd = new Date(now.getTime() + 7 * 24 * 60 * 60 * 1000);
  const today = meetings.filter(({ inicioProgramadoAt }) => inicioProgramadoAt >= todayStart && inicioProgramadoAt < todayEnd).length;
  const nextWeek = meetings.filter(({ inicioProgramadoAt }) => inicioProgramadoAt < weekEnd).length;
  const pendingAssistance = meetings.filter(({ requiereAsistenciaTecnica, asignaciones }) => requiereAsistenciaTecnica && asignaciones.length === 0).length;
  const hasPendingMeet = meetings.some(({ eventosProveedor }) =>
    eventosProveedor.some(({ proveedor, estadoIntegracion }) => proveedor.tipo === "GOOGLE_MEET" && estadoIntegracion === "PENDIENTE")
  );

  return (
    <div className="meetings-agenda-page">
      <header className="meetings-agenda-hero">
        <div>
          <p className="page-eyebrow">{formatShortDate(now)}</p>
          <h1>Agenda de reuniones</h1>
          <p>{actor.rol === "DOCENTE" ? "Tus próximas reuniones y accesos." : "Próximas reuniones, responsables y cobertura de asistencia técnica."}</p>
        </div>
        <Link className="primary-action" href="/reuniones/nueva"><CalendarPlus size={18} />Nueva reunión</Link>
      </header>

      <section className={`agenda-summary-grid ${actor.rol === "ADMINISTRACION" ? "admin-agenda-summary" : ""}`} aria-label="Resumen de agenda">
        <article><CalendarDays size={19} /><span><small>{vista === "series" ? "Series próximas" : "Encuentros próximos"}</small><strong>{vista === "series" ? series.length : meetings.length}</strong></span></article>
        <article><CalendarClock size={19} /><span><small>Hoy</small><strong>{today}</strong></span></article>
        <article><CalendarDays size={19} /><span><small>Próximos 7 días</small><strong>{nextWeek}</strong></span></article>
        <article className={pendingAssistance ? "is-warning" : ""}><UserRoundCheck size={19} /><span><small>Sin asistencia técnica</small><strong>{pendingAssistance}</strong></span></article>
        {actor.rol === "ADMINISTRACION" ? (
          <Link className="agenda-summary-link" href="/reuniones/duplicados">
            <article className={unresolvedDuplicates.length ? "is-danger" : ""}><AlertTriangle size={19} /><span><small>Duplicados por revisar</small><strong>{unresolvedDuplicates.length}</strong></span></article>
          </Link>
        ) : null}
      </section>

      <div className="agenda-controls">
        <nav className="agenda-view-switch" aria-label="Forma de visualizar la agenda">
          <Link aria-current={vista === "series" ? "page" : undefined} className={vista === "series" ? "active" : ""} href={agendaHref("series", q, programaId)}>
            <CalendarRange size={17} />
            <span>Reuniones <small>por serie</small></span>
            <strong>{series.length}</strong>
          </Link>
          <Link aria-current={vista === "encuentros" ? "page" : undefined} className={vista === "encuentros" ? "active" : ""} href={agendaHref("encuentros", q, programaId)}>
            <List size={17} />
            <span>Encuentros <small>por instancia</small></span>
            <strong>{meetings.length}</strong>
          </Link>
        </nav>
        <form className="filter-bar agenda-search" method="get">
          <Search size={18} aria-hidden="true" />
          <input name="vista" type="hidden" value={vista} />
          {actor.rol === "ADMINISTRACION" ? (
            <select aria-label="Filtrar por programa" defaultValue={programaId} name="programa">
              <option value="">Todos los programas</option>
              {programs.map((program) => (
                <option key={program.id} value={program.id}>{program.nombre}</option>
              ))}
            </select>
          ) : null}
          <input aria-label="Buscar reuniones" defaultValue={q} name="q" placeholder="Buscar por reunión, código Meet, programa o docente" type="search" />
          <button className="secondary-action" type="submit">Aplicar</button>
        </form>
      </div>

      {hasPendingMeet ? <MeetPendingNotice /> : null}

      {vista === "series" ? (
        <section className="agenda-meeting-list" aria-label="Próximas reuniones por serie">
          {series.length === 0 ? (
            <div className="content-section empty-state"><CalendarDays size={24} /><p>No hay reuniones que coincidan con la búsqueda.</p></div>
          ) : series.map((seriesMeetings) => {
            const first = seriesMeetings[0];
            const last = seriesMeetings.at(-1) ?? first;
            const request = first.solicitud;
            const association = request.docentePrograma;
            const teacher = association.docente.usuario;
            const requiredAssistance = seriesMeetings.filter(({ requiereAsistenciaTecnica }) => requiereAsistenciaTecnica);
            const pendingSeriesAssistance = requiredAssistance.filter(({ asignaciones }) => asignaciones.length === 0).length;
            const events = seriesMeetings.flatMap(({ eventosProveedor }) =>
              eventosProveedor.filter(({ proveedor }) => proveedor.tipo === "GOOGLE_MEET")
            );
            const rooms = unique(events.flatMap(({ cuentaProveedor }) => {
              const account = cuentaProveedor?.emailOrganizador ?? cuentaProveedor?.nombre;
              return account ? [account] : [];
            }));
            const codes = unique(events.flatMap(({ codigoReunion }) => codigoReunion ? [codigoReunion] : []));
            const links = unique(events.flatMap(({ joinUrl }) => joinUrl ? [joinUrl] : []));
            const sameSchedule = seriesMeetings.every(({ inicioProgramadoAt, finProgramadoAt }) =>
              formatTime(inicioProgramadoAt) === formatTime(first.inicioProgramadoAt) &&
              formatTime(finProgramadoAt) === formatTime(first.finProgramadoAt)
            );
            return (
              <article className="agenda-meeting-card agenda-series-card" key={`${request.docenteProgramaId}-${request.titulo}-${request.createdAt.toISOString()}`}>
                <header className="agenda-meeting-card-header">
                  <div className="agenda-meeting-date">
                    <span>{first.id === last.id ? formatDate(first.inicioProgramadoAt) : `${formatDate(first.inicioProgramadoAt)} → ${formatDate(last.inicioProgramadoAt)}`}</span>
                    <strong>{sameSchedule ? `${formatTime(first.inicioProgramadoAt)}–${formatTime(first.finProgramadoAt)}` : "Horarios variables"}</strong>
                  </div>
                  <div className="agenda-card-statuses">
                    <span className="status status-ok">{seriesMeetings.length} {seriesMeetings.length === 1 ? "encuentro" : "encuentros"}</span>
                  </div>
                </header>

                <div className="agenda-meeting-card-body">
                  <div className="agenda-meeting-primary">
                    <p className="agenda-program-label">{association.programa.nombre}</p>
                    <Link className="agenda-meeting-title" href={`/reuniones/${request.id}`}>{request.titulo}</Link>
                    <div className="agenda-teacher-line">
                      <span>Docente</span>
                      {actor.rol === "ADMINISTRACION" ? (
                        <Link className="teacher-meetings-link" href={`/docentes/${teacher.id}/reuniones`}>{teacher.nombres} {teacher.apellidos}</Link>
                      ) : <strong>{teacher.nombres} {teacher.apellidos}</strong>}
                    </div>
                  </div>

                  <div className="agenda-meeting-logistics">
                    <div><span>Modalidad</span><strong>{request.modalidad === "HIBRIDA" ? "Híbrida" : "Virtual"}</strong></div>
                    <div><span>Cuenta Google</span><strong>{rooms.length === 0 ? "Sin cuenta" : rooms.length === 1 ? rooms[0] : `${rooms.length} cuentas`}</strong></div>
                    <div><span>Código</span><strong>{codes.length === 0 ? "Pendiente" : codes.length === 1 ? codes[0] : `${codes.length} códigos`}</strong></div>
                    <div><span>Enlace</span><strong>{links.length === 0 ? "Pendiente" : links.length === 1 ? "Compartido en la serie" : `${links.length} enlaces`}</strong></div>
                  </div>

                  <div className={`agenda-assistant ${pendingSeriesAssistance ? "needs-assistant" : requiredAssistance.length ? "has-assistant" : "no-assistance"}`}>
                    {requiredAssistance.length ? <UserRoundCheck size={20} /> : <UserRoundMinus size={20} />}
                    <span>
                      <small>Asistencia técnica</small>
                      <strong>{requiredAssistance.length === 0
                        ? "No requiere"
                        : pendingSeriesAssistance
                          ? `${pendingSeriesAssistance} sin asignar de ${requiredAssistance.length}`
                          : `${requiredAssistance.length} con cobertura`}</strong>
                    </span>
                  </div>
                </div>

                <footer className="agenda-meeting-card-footer">
                  <Link className="text-link" href={`/reuniones/${request.id}`}>Ver serie <ArrowRight size={15} /></Link>
                  {links.length === 1 ? (
                    <MeetLinkActions openClassName="secondary-action agenda-meet-action" url={links[0]} />
                  ) : <span className="muted-text">{links.length > 1 ? "Los enlaces están en cada encuentro" : "Enlace Meet pendiente"}</span>}
                </footer>
              </article>
            );
          })}
        </section>
      ) : <section className="agenda-meeting-list" aria-label="Próximos encuentros">
        {meetings.length === 0 ? (
          <div className="content-section empty-state"><CalendarDays size={24} /><p>No hay reuniones que coincidan con la búsqueda.</p></div>
        ) : meetings.map((meeting) => {
          const association = meeting.solicitud.docentePrograma;
          const teacher = association.docente.usuario;
          const event = meeting.eventosProveedor.find(({ proveedor }) => proveedor.tipo === "GOOGLE_MEET") ?? meeting.eventosProveedor[0];
          const assignment = meeting.asignaciones[0];
          const assistant = assignment?.asistenteTecnico.usuario;
          const assistantName = assistant ? [assistant.nombres, assistant.apellidos].filter(Boolean).join(" ") : null;
          return (
            <article className="agenda-meeting-card" key={meeting.id}>
              <header className="agenda-meeting-card-header">
                <div className="agenda-meeting-date">
                  <span>{formatDate(meeting.inicioProgramadoAt)}</span>
                  <strong>{formatTime(meeting.inicioProgramadoAt)}–{formatTime(meeting.finProgramadoAt)}</strong>
                </div>
                <div className="agenda-card-statuses">
                  <span className={`status status-${statusTone(meeting.estado)}`}>{statusLabel(meeting.estado)}</span>
                </div>
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
                  <div><span>Cuenta Google</span><strong>{event?.cuentaProveedor?.emailOrganizador ?? event?.cuentaProveedor?.nombre ?? "Sin cuenta"}</strong><MeetIntegrationStatus status={event?.estadoIntegracion} /></div>
                  <div><span>Código</span><strong>{event?.codigoReunion ?? "Pendiente"}</strong></div>
                </div>

                <div className={`agenda-assistant ${assistantName ? "has-assistant" : meeting.requiereAsistenciaTecnica ? "needs-assistant" : "no-assistance"}`}>
                  {meeting.requiereAsistenciaTecnica ? <UserRoundCheck size={20} /> : <UserRoundMinus size={20} />}
                  <span>
                    <small>Asistencia técnica</small>
                    <strong>{assistantName ?? (meeting.requiereAsistenciaTecnica ? "Pendiente de asignación" : "No requiere")}</strong>
                    {assignment ? <em>Asignada</em> : null}
                  </span>
                </div>
              </div>

              <footer className="agenda-meeting-card-footer">
                <Link className="text-link" href={`/reuniones/${meeting.solicitud.id}`}>Ver detalle <ArrowRight size={15} /></Link>
                {event?.joinUrl ? (
                  <MeetLinkActions openClassName="secondary-action agenda-meet-action" url={event.joinUrl} />
                ) : <span className="muted-text">Enlace Meet pendiente</span>}
              </footer>
            </article>
          );
        })}
      </section>}
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

function agendaHref(vista: "series" | "encuentros", query: string, programaId: string): string {
  const params = new URLSearchParams({ vista });
  if (query) params.set("q", query);
  if (programaId) params.set("programa", programaId);
  return `/reuniones?${params.toString()}`;
}

function unique(values: readonly string[]): readonly string[] {
  return [...new Set(values)];
}
