import type { Prisma } from "@prisma/client";
import {
  AlertTriangle,
  ArrowRight,
  CalendarClock,
  CalendarDays,
  CalendarPlus,
  CalendarRange,
  ChevronLeft,
  ChevronRight,
  History,
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
  calcularInfoPaginacion,
  normalizarCodigoReunionBuscado,
  parsearFechaFiltro,
  resolverPaginacionAgenda,
  resolverVistaAgenda
} from "@/src/modules/reuniones/agenda-view.domain";
import { puedeVerAgendaCompleta } from "@/src/modules/reuniones/reuniones.domain";
import { listarCasosRevisionDuplicados } from "@/src/modules/reuniones/duplicados.service";

const ACTIVE_ASSIGNMENTS = ["ASIGNADO", "ACEPTADO"] as const;
type PeriodoAgenda = "proximas" | "anteriores";

const meetingInclude = {
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
    orderBy: { updatedAt: "desc" as const },
    take: 1
  }
} satisfies Prisma.InstanciaSalaInclude;

export default async function ReunionesPage({
  searchParams
}: Readonly<{
  searchParams: Promise<{
    q?: string;
    vista?: string;
    programa?: string;
    periodo?: string;
    page?: string;
    desde?: string;
    hasta?: string;
  }>;
}>) {
  const session = await auth();
  if (!session?.user) redirect("/acceso");
  const actor = await resolveSessionActor(db, { id: session.user.id, email: session.user.email });
  if (!actor?.activo || !puedeVerAgendaCompleta(actor.rol)) redirect("/mi-agenda");

  const {
    q = "",
    vista: vistaParam,
    programa: programaParam = "",
    periodo: periodoParam,
    page: pageParam,
    desde: desdeParam = "",
    hasta: hastaParam = ""
  } = await searchParams;

  const vista = resolverVistaAgenda(vistaParam);
  const query = q.trim();
  const programaId = actor.rol === "ADMINISTRACION" ? programaParam.trim() : "";
  const periodo: PeriodoAgenda = actor.rol === "ADMINISTRACION" && periodoParam === "anteriores"
    ? "anteriores"
    : "proximas";
  const isHistory = periodo === "anteriores";
  const meetingCodeQuery = normalizarCodigoReunionBuscado(query);
  const now = new Date();

  const desdeIso = parsearFechaFiltro(desdeParam, false);
  const hastaIso = parsearFechaFiltro(hastaParam, true);
  const desdeDate = desdeIso ? new Date(desdeIso) : undefined;
  const hastaDate = hastaIso ? new Date(hastaIso) : undefined;

  const requestScope: Prisma.SolicitudSalaWhereInput = actor.rol === "DOCENTE"
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

  const temporalWhere: Prisma.InstanciaSalaWhereInput = {
    finProgramadoAt: isHistory ? { lt: now } : { gte: now },
    ...(desdeDate || hastaDate
      ? {
          inicioProgramadoAt: {
            ...(desdeDate ? { gte: desdeDate } : {}),
            ...(hastaDate ? { lte: hastaDate } : {})
          }
        }
      : {})
  };

  const dateRangeWhere: Prisma.InstanciaSalaWhereInput = desdeDate || hastaDate
    ? {
        inicioProgramadoAt: {
          ...(desdeDate ? { gte: desdeDate } : {}),
          ...(hastaDate ? { lte: hastaDate } : {})
        }
      }
    : {};

  const instanceSearch: Prisma.InstanciaSalaWhereInput = query
    ? {
        OR: [
          {
            eventosProveedor: {
              some: {
                OR: [
                  { codigoReunion: { contains: meetingCodeQuery, mode: "insensitive" } },
                  { joinUrl: { contains: query, mode: "insensitive" } }
                ]
              }
            }
          },
          { solicitud: { titulo: { contains: query, mode: "insensitive" } } },
          { solicitud: { docentePrograma: { programa: { nombre: { contains: query, mode: "insensitive" } } } } },
          {
            solicitud: {
              docentePrograma: {
                docente: {
                  usuario: {
                    OR: [
                      { nombres: { contains: query, mode: "insensitive" } },
                      { apellidos: { contains: query, mode: "insensitive" } }
                    ]
                  }
                }
              }
            }
          }
        ]
      }
    : {};

  const baseInstanceWhere: Prisma.InstanciaSalaWhereInput = {
    estado: { not: "CANCELADA" },
    solicitud: requestScope,
    ...instanceSearch
  };

  const encounterWhere: Prisma.InstanciaSalaWhereInput = {
    ...baseInstanceWhere,
    ...temporalWhere
  };

  const seriesSearch: Prisma.SolicitudSalaWhereInput = query
    ? {
        OR: [
          { titulo: { contains: query, mode: "insensitive" } },
          { docentePrograma: { programa: { nombre: { contains: query, mode: "insensitive" } } } },
          {
            docentePrograma: {
              docente: {
                usuario: {
                  OR: [
                    { nombres: { contains: query, mode: "insensitive" } },
                    { apellidos: { contains: query, mode: "insensitive" } }
                  ]
                }
              }
            }
          },
          {
            instancias: {
              some: {
                estado: { not: "CANCELADA" },
                ...temporalWhere,
                eventosProveedor: {
                  some: {
                    OR: [
                      { codigoReunion: { contains: meetingCodeQuery, mode: "insensitive" } },
                      { joinUrl: { contains: query, mode: "insensitive" } }
                    ]
                  }
                }
              }
            }
          }
        ]
      }
    : {};

  const seriesWhere: Prisma.SolicitudSalaWhereInput = {
    ...requestScope,
    ...seriesSearch,
    instancias: {
      some: {
        estado: { not: "CANCELADA" },
        ...temporalWhere
      }
    }
  };

  const [totalMeetings, totalSeries] = await Promise.all([
    db.instanciaSala.count({ where: encounterWhere }),
    db.solicitudSala.count({ where: seriesWhere })
  ]);

  const requestedPagination = resolverPaginacionAgenda(pageParam, 50);
  const selectedTotal = vista === "series" ? totalSeries : totalMeetings;
  const pagination = calcularInfoPaginacion(selectedTotal, requestedPagination.page, requestedPagination.pageSize);
  const skip = (pagination.paginaActual - 1) * pagination.tamanoPagina;

  const meetingsPromise = vista === "encuentros"
    ? db.instanciaSala.findMany({
        where: encounterWhere,
        orderBy: { inicioProgramadoAt: isHistory ? "desc" : "asc" },
        take: pagination.tamanoPagina,
        skip,
        include: meetingInclude
      })
    : db.solicitudSala.findMany({
        where: seriesWhere,
        orderBy: { fechaInicioSolicitada: isHistory ? "desc" : "asc" },
        take: pagination.tamanoPagina,
        skip,
        select: { id: true }
      }).then(async (requests) => {
        const requestIds = requests.map(({ id }) => id);
        if (requestIds.length === 0) return [];
        return db.instanciaSala.findMany({
          where: {
            solicitudSalaId: { in: requestIds },
            estado: { not: "CANCELADA" },
            ...temporalWhere
          },
          orderBy: { inicioProgramadoAt: isHistory ? "desc" : "asc" },
          include: meetingInclude
        });
      });

  const todayStart = startOfMontevideoDay(now);
  const todayEnd = new Date(todayStart.getTime() + 24 * 60 * 60 * 1000);
  const weekEnd = new Date(now.getTime() + 7 * 24 * 60 * 60 * 1000);
  const sevenDaysAgo = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
  const thirtyDaysAgo = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);

  const [
    meetings,
    programs,
    todayCount,
    nextWeekCount,
    lastSevenDaysCount,
    lastThirtyDaysCount,
    pendingAssistanceCount
  ] = await Promise.all([
    meetingsPromise,
    actor.rol === "ADMINISTRACION"
      ? db.programa.findMany({
          where: { activo: true },
          orderBy: { nombre: "asc" },
          select: { id: true, nombre: true }
        })
      : Promise.resolve([]),
    db.instanciaSala.count({
      where: {
        AND: [
          baseInstanceWhere,
          dateRangeWhere,
          { inicioProgramadoAt: { gte: todayStart, lt: todayEnd } }
        ]
      }
    }),
    db.instanciaSala.count({
      where: {
        AND: [
          baseInstanceWhere,
          dateRangeWhere,
          { inicioProgramadoAt: { gte: now, lt: weekEnd } }
        ]
      }
    }),
    db.instanciaSala.count({
      where: {
        AND: [
          baseInstanceWhere,
          dateRangeWhere,
          { finProgramadoAt: { gte: sevenDaysAgo, lt: now } }
        ]
      }
    }),
    db.instanciaSala.count({
      where: {
        AND: [
          baseInstanceWhere,
          dateRangeWhere,
          { finProgramadoAt: { gte: thirtyDaysAgo, lt: now } }
        ]
      }
    }),
    db.instanciaSala.count({
      where: {
        AND: [
          encounterWhere,
          {
            requiereAsistenciaTecnica: true,
            asignaciones: { none: { estado: { in: [...ACTIVE_ASSIGNMENTS] } } }
          }
        ]
      }
    })
  ]);

  const duplicateCases = actor.rol === "ADMINISTRACION" && !isHistory
    ? await listarCasosRevisionDuplicados(db, now)
    : [];
  const unresolvedDuplicates = duplicateCases.filter(({ decision }) => decision !== "FALSO_POSITIVO");
  const meetingsForSeries = isHistory ? [...meetings].reverse() : meetings;
  const series = agruparEncuentrosPorSerie(meetingsForSeries, isHistory);
  const hasPendingMeet = !isHistory && meetings.some(({ eventosProveedor }) =>
    eventosProveedor.some(({ proveedor, estadoIntegracion }) =>
      proveedor.tipo === "GOOGLE_MEET" && estadoIntegracion === "PENDIENTE"
    )
  );

  return (
    <div className="meetings-agenda-page">
      <header className="meetings-agenda-hero">
        <div>
          <p className="page-eyebrow">{formatShortDate(now)}</p>
          <h1>Agenda de reuniones</h1>
          <p>{actor.rol === "DOCENTE"
            ? "Tus próximas reuniones y accesos."
            : isHistory
              ? "Historial de reuniones realizadas, responsables y asistencia técnica."
              : "Próximas reuniones, responsables y cobertura de asistencia técnica."}</p>
        </div>
        <Link className="primary-action" href="/reuniones/nueva"><CalendarPlus size={18} />Nueva reunión</Link>
      </header>

      {actor.rol === "ADMINISTRACION" ? (
        <nav className="agenda-view-switch" aria-label="Período de reuniones">
          <Link
            aria-current={!isHistory ? "page" : undefined}
            className={!isHistory ? "active" : ""}
            href={periodoHref("proximas", vista, q, programaId, desdeParam, hastaParam)}
          >
            <CalendarDays size={17} />
            <span>Próximas <small>desde ahora</small></span>
          </Link>
          <Link
            aria-current={isHistory ? "page" : undefined}
            className={isHistory ? "active" : ""}
            href={periodoHref("anteriores", vista, q, programaId, desdeParam, hastaParam)}
          >
            <History size={17} />
            <span>Anteriores <small>historial</small></span>
          </Link>
        </nav>
      ) : null}

      <section className={`agenda-summary-grid ${actor.rol === "ADMINISTRACION" ? "admin-agenda-summary" : ""}`} aria-label="Resumen de agenda">
        <article>
          <CalendarDays size={19} />
          <span>
            <small>{vista === "series" ? (isHistory ? "Series anteriores" : "Series próximas") : (isHistory ? "Encuentros anteriores" : "Encuentros próximos")}</small>
            <strong>{vista === "series" ? totalSeries : totalMeetings}</strong>
          </span>
        </article>
        <article><CalendarClock size={19} /><span><small>{isHistory ? "Últimos 7 días" : "Hoy"}</small><strong>{isHistory ? lastSevenDaysCount : todayCount}</strong></span></article>
        <article><CalendarDays size={19} /><span><small>{isHistory ? "Últimos 30 días" : "Próximos 7 días"}</small><strong>{isHistory ? lastThirtyDaysCount : nextWeekCount}</strong></span></article>
        <article className={pendingAssistanceCount ? "is-warning" : ""}><UserRoundCheck size={19} /><span><small>Sin asistencia técnica</small><strong>{pendingAssistanceCount}</strong></span></article>
        {actor.rol === "ADMINISTRACION" && !isHistory ? (
          <Link className="agenda-summary-link" href="/reuniones/duplicados">
            <article className={unresolvedDuplicates.length ? "is-danger" : ""}><AlertTriangle size={19} /><span><small>Duplicados por revisar</small><strong>{unresolvedDuplicates.length}</strong></span></article>
          </Link>
        ) : null}
      </section>

      <div className="agenda-controls">
        <nav className="agenda-view-switch" aria-label="Forma de visualizar la agenda">
          <Link
            aria-current={vista === "series" ? "page" : undefined}
            className={vista === "series" ? "active" : ""}
            href={agendaHref("series", q, programaId, periodo, desdeParam, hastaParam)}
          >
            <CalendarRange size={17} />
            <span>Reuniones <small>por serie</small></span>
            <strong>{totalSeries}</strong>
          </Link>
          <Link
            aria-current={vista === "encuentros" ? "page" : undefined}
            className={vista === "encuentros" ? "active" : ""}
            href={agendaHref("encuentros", q, programaId, periodo, desdeParam, hastaParam)}
          >
            <List size={17} />
            <span>Encuentros <small>por instancia</small></span>
            <strong>{totalMeetings}</strong>
          </Link>
        </nav>

        <form className="filter-bar agenda-search" method="get">
          <Search size={18} aria-hidden="true" />
          <input name="vista" type="hidden" value={vista} />
          {actor.rol === "ADMINISTRACION" ? <input name="periodo" type="hidden" value={periodo} /> : null}
          {actor.rol === "ADMINISTRACION" ? (
            <select aria-label="Filtrar por programa" defaultValue={programaId} name="programa">
              <option value="">Todos los programas</option>
              {programs.map((program) => <option key={program.id} value={program.id}>{program.nombre}</option>)}
            </select>
          ) : null}
          <div className="agenda-date-inputs">
            <label className="agenda-date-label"><span>Desde</span><input aria-label="Fecha desde" defaultValue={desdeParam} name="desde" type="date" /></label>
            <label className="agenda-date-label"><span>Hasta</span><input aria-label="Fecha hasta" defaultValue={hastaParam} name="hasta" type="date" /></label>
          </div>
          <input aria-label="Buscar reuniones" defaultValue={q} name="q" placeholder="Buscar por reunión, código Meet, programa o docente" type="search" />
          <button className="secondary-action" type="submit">Aplicar</button>
          {(q || programaId || desdeParam || hastaParam) ? (
            <Link className="agenda-clear-filters" href={agendaHref(vista, "", "", periodo)}>Limpiar</Link>
          ) : null}
        </form>
      </div>

      {hasPendingMeet ? <MeetPendingNotice /> : null}

      {vista === "series" ? (
        <section className="agenda-meeting-list" aria-label={isHistory ? "Reuniones anteriores por serie" : "Próximas reuniones por serie"}>
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
            const events = seriesMeetings.flatMap(({ eventosProveedor }) => eventosProveedor.filter(({ proveedor }) => proveedor.tipo === "GOOGLE_MEET"));
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
              <article className="agenda-meeting-card agenda-series-card" key={request.id}>
                <header className="agenda-meeting-card-header">
                  <div className="agenda-meeting-date">
                    <span>{first.id === last.id ? formatDate(first.inicioProgramadoAt) : `${formatDate(first.inicioProgramadoAt)} → ${formatDate(last.inicioProgramadoAt)}`}</span>
                    <strong>{sameSchedule ? `${formatTime(first.inicioProgramadoAt)}–${formatTime(first.finProgramadoAt)}` : "Horarios variables"}</strong>
                  </div>
                  <div className="agenda-card-statuses"><span className="status status-ok">{seriesMeetings.length} {seriesMeetings.length === 1 ? "encuentro" : "encuentros"}</span></div>
                </header>

                <div className="agenda-meeting-card-body">
                  <div className="agenda-meeting-primary">
                    <p className="agenda-program-label">{association.programa.nombre}</p>
                    <Link className="agenda-meeting-title" href={`/reuniones/${request.id}`}>{request.titulo}</Link>
                    <div className="agenda-teacher-line">
                      <span>Docente</span>
                      {actor.rol === "ADMINISTRACION"
                        ? <Link className="teacher-meetings-link" href={`/docentes/${teacher.id}/reuniones`}>{teacher.nombres} {teacher.apellidos}</Link>
                        : <strong>{teacher.nombres} {teacher.apellidos}</strong>}
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
                  {links.length === 1
                    ? <MeetLinkActions openClassName="secondary-action agenda-meet-action" url={links[0]} />
                    : <span className="muted-text">{links.length > 1 ? "Los enlaces están en cada encuentro" : "Enlace Meet pendiente"}</span>}
                </footer>
              </article>
            );
          })}
        </section>
      ) : (
        <section className="agenda-meeting-list" aria-label={isHistory ? "Encuentros anteriores" : "Próximos encuentros"}>
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
                  <div className="agenda-meeting-date"><span>{formatDate(meeting.inicioProgramadoAt)}</span><strong>{formatTime(meeting.inicioProgramadoAt)}–{formatTime(meeting.finProgramadoAt)}</strong></div>
                  <div className="agenda-card-statuses"><span className={`status status-${statusTone(meeting.estado)}`}>{statusLabel(meeting.estado)}</span></div>
                </header>

                <div className="agenda-meeting-card-body">
                  <div className="agenda-meeting-primary">
                    <p className="agenda-program-label">{association.programa.nombre}</p>
                    <Link className="agenda-meeting-title" href={`/reuniones/${meeting.solicitud.id}`}>{meeting.solicitud.titulo}</Link>
                    <div className="agenda-teacher-line">
                      <span>Docente</span>
                      {actor.rol === "ADMINISTRACION"
                        ? <Link className="teacher-meetings-link" href={`/docentes/${teacher.id}/reuniones`}>{teacher.nombres} {teacher.apellidos}</Link>
                        : <strong>{teacher.nombres} {teacher.apellidos}</strong>}
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
                  {event?.joinUrl
                    ? <MeetLinkActions openClassName="secondary-action agenda-meet-action" url={event.joinUrl} />
                    : <span className="muted-text">Enlace Meet pendiente</span>}
                </footer>
              </article>
            );
          })}
        </section>
      )}

      {pagination.totalPaginas > 1 ? (
        <nav className="agenda-pagination" aria-label="Paginación de reuniones">
          <div className="pagination-info">
            Mostrando <strong>{pagination.desdeElemento}–{pagination.hastaElemento}</strong> de <strong>{pagination.totalElementos}</strong> {vista === "series" ? (pagination.totalElementos === 1 ? "serie" : "series") : (pagination.totalElementos === 1 ? "encuentro" : "encuentros")}
          </div>
          <div className="pagination-buttons">
            {pagination.tieneAnterior ? (
              <Link className="secondary-action pagination-btn" href={pageHref({ vista, q, programa: programaId, periodo, desde: desdeParam, hasta: hastaParam, page: pagination.paginaActual - 1 })}>
                <ChevronLeft size={16} /> Anterior
              </Link>
            ) : <span className="secondary-action pagination-btn is-disabled" aria-disabled="true"><ChevronLeft size={16} /> Anterior</span>}
            <span className="pagination-current">Página <strong>{pagination.paginaActual}</strong> de <strong>{pagination.totalPaginas}</strong></span>
            {pagination.tieneSiguiente ? (
              <Link className="secondary-action pagination-btn" href={pageHref({ vista, q, programa: programaId, periodo, desde: desdeParam, hasta: hastaParam, page: pagination.paginaActual + 1 })}>
                Siguiente <ChevronRight size={16} />
              </Link>
            ) : <span className="secondary-action pagination-btn is-disabled" aria-disabled="true">Siguiente <ChevronRight size={16} /></span>}
          </div>
        </nav>
      ) : selectedTotal > 0 ? (
        <div className="pagination-info" style={{ marginTop: "10px", textAlign: "center" }}>
          Mostrando {selectedTotal} {vista === "series" ? (selectedTotal === 1 ? "serie" : "series") : (selectedTotal === 1 ? "encuentro" : "encuentros")}
        </div>
      ) : null}
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

function agendaHref(
  vista: "series" | "encuentros",
  query: string,
  programaId: string,
  periodo: PeriodoAgenda,
  desde = "",
  hasta = ""
): string {
  return pageHref({ vista, q: query, programa: programaId, periodo, desde, hasta });
}

function periodoHref(
  periodo: PeriodoAgenda,
  vista: "series" | "encuentros",
  query: string,
  programaId: string,
  desde = "",
  hasta = ""
): string {
  return pageHref({ vista, q: query, programa: programaId, periodo, desde, hasta });
}

function pageHref(params: {
  vista: "series" | "encuentros";
  q?: string;
  programa?: string;
  periodo?: PeriodoAgenda;
  desde?: string;
  hasta?: string;
  page?: number;
}): string {
  const search = new URLSearchParams({ vista: params.vista });
  if (params.q) search.set("q", params.q);
  if (params.programa) search.set("programa", params.programa);
  if (params.periodo === "anteriores") search.set("periodo", params.periodo);
  if (params.desde) search.set("desde", params.desde);
  if (params.hasta) search.set("hasta", params.hasta);
  if (params.page && params.page > 1) search.set("page", String(params.page));
  return `/reuniones?${search.toString()}`;
}

function unique(values: readonly string[]): readonly string[] {
  return [...new Set(values)];
}
