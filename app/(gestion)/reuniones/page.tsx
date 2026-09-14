import type { Prisma } from "@prisma/client";
import {
  AlertTriangle,
  ArrowRight,
  CalendarClock,
  CalendarDays,
  CalendarPlus,
  CalendarRange,
  CheckCircle2,
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
import { AdminRetryMeetAction } from "@/src/components/admin-attention-actions";
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
import { cohostsConfirmados } from "@/src/modules/meet/cohost-verification.domain";
import { cohostAccountGuidance } from "@/src/modules/meet/cohosts.domain";

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
  cohosts: {
    include: {
      cuentaGoogle: {
        include: { user: true }
      }
    }
  },
  cohostEmails: true,
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

  const actor = await resolveSessionActor(db, {
    id: session.user.id,
    email: session.user.email
  });
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
  const periodo: PeriodoAgenda =
    actor.rol === "ADMINISTRACION" && periodoParam === "anteriores" ? "anteriores" : "proximas";
  const isHistory = periodo === "anteriores";
  const meetingCodeQuery = normalizarCodigoReunionBuscado(query);
  const now = new Date();

  const desdeIso = parsearFechaFiltro(desdeParam, false);
  const hastaIso = parsearFechaFiltro(hastaParam, true);
  const desdeDate = desdeIso ? new Date(desdeIso) : undefined;
  const hastaDate = hastaIso ? new Date(hastaIso) : undefined;

  const requestScope: Prisma.SolicitudSalaWhereInput =
    actor.rol === "DOCENTE"
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

  const dateRangeWhere: Prisma.InstanciaSalaWhereInput =
    desdeDate || hastaDate
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
          {
            solicitud: {
              docentePrograma: {
                programa: { nombre: { contains: query, mode: "insensitive" } }
              }
            }
          },
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
          },
          {
            cohosts: {
              some: {
                cuentaGoogle: {
                  OR: [
                    { email: { contains: query, mode: "insensitive" } },
                    { user: { nombres: { contains: query, mode: "insensitive" } } },
                    { user: { apellidos: { contains: query, mode: "insensitive" } } }
                  ]
                }
              }
            }
          },
          { cohostEmails: { some: { email: { contains: query, mode: "insensitive" } } } }
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
                  {
                    cohosts: {
                      some: {
                        cuentaGoogle: {
                          OR: [
                            { email: { contains: query, mode: "insensitive" } },
                            { user: { nombres: { contains: query, mode: "insensitive" } } },
                            { user: { apellidos: { contains: query, mode: "insensitive" } } }
                          ]
                        }
                      }
                    }
                  },
                  { cohostEmails: { some: { email: { contains: query, mode: "insensitive" } } } }
                ]
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
  const pagination = calcularInfoPaginacion(
    selectedTotal,
    requestedPagination.page,
    requestedPagination.pageSize
  );
  const skip = (pagination.paginaActual - 1) * pagination.tamanoPagina;

  const meetingsPromise =
    vista === "encuentros"
      ? db.instanciaSala.findMany({
          where: encounterWhere,
          orderBy: { inicioProgramadoAt: isHistory ? "desc" : "asc" },
          take: pagination.tamanoPagina,
          skip,
          include: meetingInclude
        })
      : db.solicitudSala
          .findMany({
            where: seriesWhere,
            orderBy: { fechaInicioSolicitada: isHistory ? "desc" : "asc" },
            take: pagination.tamanoPagina,
            skip,
            select: { id: true }
          })
          .then(async (requests) => {
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

  const meetingsForSeries = isHistory ? [...meetings].reverse() : meetings;
  const series = agruparEncuentrosPorSerie(meetingsForSeries, isHistory);
  const hasPendingMeet =
    !isHistory &&
    meetings.some(({ eventosProveedor }) =>
      eventosProveedor.some(
        ({ proveedor, estadoIntegracion }) =>
          proveedor.tipo === "GOOGLE_MEET" && estadoIntegracion === "PENDIENTE"
      )
    );

  return (
    <div className="meetings-agenda-page agenda-v2">
      <header className="meetings-agenda-hero">
        <div>
          <p className="page-eyebrow">{formatShortDate(now)}</p>
          <h1>Agenda de reuniones</h1>
          <p>
            {isHistory
              ? "Historial de reuniones realizadas."
              : "Próximas reuniones, cohosts y cobertura de asistencia técnica."}
          </p>
        </div>
        <Link className="primary-action" href="/reuniones/nueva">
          <CalendarPlus size={18} />
          Nueva reunión
        </Link>
      </header>

      {actor.rol === "ADMINISTRACION" && (
        <Link className="secondary-action" href="/reuniones/buscar-meet">
          <Search size={17} aria-hidden="true" /> Buscar por enlace o código Meet
        </Link>
      )}

      {actor.rol === "ADMINISTRACION" ? (
        <nav className="agenda-view-switch agenda-period-switch" aria-label="Período de reuniones">
          <Link
            aria-current={!isHistory ? "page" : undefined}
            className={!isHistory ? "active" : ""}
            href={periodoHref("proximas", vista, q, programaId, desdeParam, hastaParam)}
          >
            <CalendarDays size={17} />
            <span>
              Próximas <small>desde ahora</small>
            </span>
          </Link>
          <Link
            aria-current={isHistory ? "page" : undefined}
            className={isHistory ? "active" : ""}
            href={periodoHref("anteriores", vista, q, programaId, desdeParam, hastaParam)}
          >
            <History size={17} />
            <span>
              Anteriores <small>historial</small>
            </span>
          </Link>
        </nav>
      ) : null}

      <section
        className="agenda-summary-grid admin-agenda-summary"
        aria-label="Resumen de agenda"
      >
        <article>
          <CalendarDays size={19} />
          <span>
            <small>
              {vista === "series"
                ? isHistory
                  ? "Series anteriores"
                  : "Series próximas"
                : isHistory
                  ? "Encuentros anteriores"
                  : "Encuentros próximos"}
            </small>
            <strong>{vista === "series" ? totalSeries : totalMeetings}</strong>
          </span>
        </article>
        <article>
          <CalendarClock size={19} />
          <span>
            <small>{isHistory ? "Últimos 7 días" : "Hoy"}</small>
            <strong>{isHistory ? lastSevenDaysCount : todayCount}</strong>
          </span>
        </article>
        <article>
          <CalendarDays size={19} />
          <span>
            <small>{isHistory ? "Últimos 30 días" : "Próximos 7 días"}</small>
            <strong>{isHistory ? lastThirtyDaysCount : nextWeekCount}</strong>
          </span>
        </article>
        <article className={pendingAssistanceCount ? "is-warning" : ""}>
          <UserRoundCheck size={19} />
          <span>
            <small>Sin asistencia técnica</small>
            <strong>{pendingAssistanceCount}</strong>
          </span>
        </article>
      </section>

      <section className="agenda-toolbar" aria-label="Controles de agenda">
        <nav className="agenda-view-switch agenda-kind-switch" aria-label="Forma de visualizar la agenda">
          <Link
            aria-current={vista === "series" ? "page" : undefined}
            className={vista === "series" ? "active" : ""}
            href={agendaHref("series", q, programaId, periodo, desdeParam, hastaParam)}
          >
            <CalendarRange size={17} />
            <span>
              Reuniones <small>por serie</small>
            </span>
            <strong>{totalSeries}</strong>
          </Link>
          <Link
            aria-current={vista === "encuentros" ? "page" : undefined}
            className={vista === "encuentros" ? "active" : ""}
            href={agendaHref("encuentros", q, programaId, periodo, desdeParam, hastaParam)}
          >
            <List size={17} />
            <span>
              Encuentros <small>por instancia</small>
            </span>
            <strong>{totalMeetings}</strong>
          </Link>
        </nav>

        <form className="agenda-filter-panel" method="get">
          <input name="vista" type="hidden" value={vista} />
          {actor.rol === "ADMINISTRACION" ? (
            <input name="periodo" type="hidden" value={periodo} />
          ) : null}

          <label className="agenda-query-field">
            <span className="sr-only">Buscar reuniones</span>
            <Search size={18} aria-hidden="true" />
            <input
              aria-label="Buscar reuniones"
              defaultValue={q}
              name="q"
              placeholder="Buscar reunión, código, programa, docente o cohost"
              type="search"
            />
          </label>

          {actor.rol === "ADMINISTRACION" ? (
            <label className="agenda-program-filter">
              <span>Programa</span>
              <select aria-label="Filtrar por programa" defaultValue={programaId} name="programa">
                <option value="">Todos los programas</option>
                {programs.map((program) => (
                  <option key={program.id} value={program.id}>
                    {program.nombre}
                  </option>
                ))}
              </select>
            </label>
          ) : null}

          <div className="agenda-date-inputs">
            <label className="agenda-date-label">
              <span>Desde</span>
              <input
                aria-label="Fecha desde"
                defaultValue={desdeParam}
                name="desde"
                type="date"
              />
            </label>
            <label className="agenda-date-label">
              <span>Hasta</span>
              <input
                aria-label="Fecha hasta"
                defaultValue={hastaParam}
                name="hasta"
                type="date"
              />
            </label>
          </div>

          <div className="agenda-filter-actions">
            <button className="secondary-action" type="submit">
              Aplicar
            </button>
            {q || programaId || desdeParam || hastaParam ? (
              <Link className="agenda-clear-filters" href={agendaHref(vista, "", "", periodo)}>
                Limpiar
              </Link>
            ) : null}
          </div>
        </form>
      </section>

      {hasPendingMeet ? <MeetPendingNotice /> : null}

      {vista === "series" ? (
        <section
          className="agenda-meeting-list"
          aria-label={isHistory ? "Reuniones anteriores por serie" : "Próximas reuniones por serie"}
        >
          {series.length === 0 ? (
            <div className="content-section empty-state">
              <CalendarDays size={24} />
              <p>No hay reuniones que coincidan con la búsqueda.</p>
            </div>
          ) : (
            series.map((seriesMeetings) => {
              const first = seriesMeetings[0];
              const last = seriesMeetings.at(-1) ?? first;
              const request = first.solicitud;
              const association = request.docentePrograma;
              const teacher = association.docente.usuario;
              const requiredAssistance = seriesMeetings.filter(
                ({ requiereAsistenciaTecnica }) => requiereAsistenciaTecnica
              );
              const pendingSeriesAssistance = requiredAssistance.filter(
                ({ asignaciones }) => asignaciones.length === 0
              ).length;
              const assistantNames = unique(
                seriesMeetings.flatMap(({ asignaciones }) =>
                  asignaciones.flatMap(({ asistenteTecnico }) => {
                    const name = personName(asistenteTecnico.usuario);
                    return name ? [name] : [];
                  })
                )
              );
              const events = seriesMeetings.flatMap(({ eventosProveedor }) =>
                eventosProveedor.filter(({ proveedor }) => proveedor.tipo === "GOOGLE_MEET")
              );
              const organizers = unique(
                events.flatMap(({ cuentaProveedor }) => {
                  const account =
                    cuentaProveedor?.emailOrganizador ?? cuentaProveedor?.nombre;
                  return account ? [account] : [];
                })
              );
              const codes = unique(
                events.flatMap(({ codigoReunion }) =>
                  codigoReunion ? [codigoReunion] : []
                )
              );
              const links = unique(
                events.flatMap(({ joinUrl }) => (joinUrl ? [joinUrl] : []))
              );
              const cohostLabels = unique(
                seriesMeetings.flatMap((meeting) => cohostsForMeeting(meeting))
              );
              const seriesCohostEmails = unique(
                seriesMeetings.flatMap((meeting) => [
                  ...meeting.cohosts.map(({ cuentaGoogle }) => cuentaGoogle.email),
                  ...meeting.cohostEmails.map(({ email }) => email)
                ])
              );
              const seriesCohostsConfirmados = Boolean(
                seriesCohostEmails.length > 0 &&
                seriesMeetings.every((meeting) => {
                  const meetingCohostEmails = [
                    ...meeting.cohosts.map(({ cuentaGoogle }) => cuentaGoogle.email),
                    ...meeting.cohostEmails.map(({ email }) => email)
                  ];
                  if (meetingCohostEmails.length === 0) return true;
                  const meetingEvent = meeting.eventosProveedor.find(
                    ({ proveedor }) => proveedor.tipo === "GOOGLE_MEET"
                  );
                  return Boolean(
                    meetingEvent &&
                    !meetingEvent.errorIntegracion &&
                    !meetingEvent.operacionPendiente &&
                    cohostsConfirmados(
                      meetingEvent.payloadUltimo,
                      meetingEvent.codigoReunion,
                      meetingEvent.cuentaProveedor?.emailOrganizador,
                      meetingCohostEmails
                    )
                  );
                })
              );
              const seriesGuidance = cohostAccountGuidance(seriesCohostEmails);
              const sameSchedule = seriesMeetings.every(
                ({ inicioProgramadoAt, finProgramadoAt }) =>
                  formatTime(inicioProgramadoAt) === formatTime(first.inicioProgramadoAt) &&
                  formatTime(finProgramadoAt) === formatTime(first.finProgramadoAt)
              );

              return (
                <article className="agenda-meeting-card agenda-series-card" key={request.id}>
                  <header className="agenda-meeting-card-header">
                    <div className="agenda-meeting-date">
                      <span>
                        {first.id === last.id
                          ? formatDate(first.inicioProgramadoAt)
                          : `${formatDate(first.inicioProgramadoAt)} → ${formatDate(last.inicioProgramadoAt)}`}
                      </span>
                      <strong>
                        {sameSchedule
                          ? `${formatTime(first.inicioProgramadoAt)}–${formatTime(first.finProgramadoAt)}`
                          : "Horarios variables"}
                      </strong>
                    </div>
                    <span className="status status-ok">
                      {seriesMeetings.length}{" "}
                      {seriesMeetings.length === 1 ? "encuentro" : "encuentros"}
                    </span>
                  </header>

                  <div className="agenda-meeting-card-body">
                    <div className="agenda-meeting-primary">
                      <p className="agenda-program-label">{association.programa.nombre}</p>
                      <Link className="agenda-meeting-title" href={`/reuniones/${request.id}`}>
                        {request.titulo}
                      </Link>
                      <div className="agenda-teacher-line">
                        <span>Docente</span>
                        {actor.rol === "ADMINISTRACION" ? (
                          <Link
                            className="teacher-meetings-link"
                            href={`/docentes/${teacher.id}/reuniones`}
                          >
                            {personName(teacher)}
                          </Link>
                        ) : (
                          <strong>{personName(teacher)}</strong>
                        )}
                      </div>
                      <span className="agenda-modality-chip">
                        {request.modalidad === "HIBRIDA" ? "Híbrida" : "Virtual"}
                      </span>
                    </div>

                    <div className="agenda-access-panel">
                      <div
                        className={`agenda-access-block agenda-cohost-block ${
                          cohostLabels.length === 0
                            ? "is-missing"
                            : seriesCohostsConfirmados
                              ? "is-verified"
                              : "is-unverified"
                        }`}
                      >
                        <div className="agenda-cohost-header">
                          <span>
                            Cohost{cohostLabels.length === 1 ? "" : "s"}
                            {cohostLabels.length ? ` · ${seriesGuidance}` : ""}
                          </span>
                          {cohostLabels.length ? (
                            seriesCohostsConfirmados ? (
                              <span
                                className="status-badge status-ok"
                                title="Verificado en Google Meet"
                              >
                                <CheckCircle2 size={12} aria-hidden="true" /> Verificado en Meet
                              </span>
                            ) : (
                              <span
                                className="status-badge status-warning"
                                title="Google Meet todavía no confirmó los permisos de cohost"
                              >
                                <AlertTriangle size={12} aria-hidden="true" /> Permisos pendientes en Meet
                              </span>
                            )
                          ) : null}
                        </div>
                        <strong>{cohostPrimaryText(cohostLabels)}</strong>
                        {cohostLabels.length > 2 ? (
                          <small>+{cohostLabels.length - 2} más en la serie</small>
                        ) : null}
                      </div>
                      <div className="agenda-access-block agenda-host-reference">
                        <span>Cuenta organizadora</span>
                        <strong>
                          {organizers.length === 0
                            ? "Pendiente"
                            : organizers.length === 1
                              ? organizers[0]
                              : `${organizers.length} cuentas`}
                        </strong>
                        <small>Solo referencia · no iniciar sesión.</small>
                      </div>
                      <div className="agenda-access-block">
                        <span>Código Meet</span>
                        <strong>
                          {codes.length === 0
                            ? "Pendiente"
                            : codes.length === 1
                              ? codes[0]
                              : `${codes.length} códigos`}
                        </strong>
                      </div>
                    </div>

                    <div
                      className={`agenda-assistant ${
                        pendingSeriesAssistance
                          ? "needs-assistant"
                          : requiredAssistance.length
                            ? "has-assistant"
                            : "no-assistance"
                      }`}
                    >
                      {requiredAssistance.length ? (
                        <UserRoundCheck size={20} />
                      ) : (
                        <UserRoundMinus size={20} />
                      )}
                      <span>
                        <small>Asistencia técnica</small>
                        <strong>
                          {requiredAssistance.length === 0
                            ? "No requiere"
                            : pendingSeriesAssistance
                              ? `${pendingSeriesAssistance} sin asignar de ${requiredAssistance.length}`
                              : assistantNames.length === 1
                                ? assistantNames[0]
                                : `${assistantNames.length} asistentes asignados`}
                        </strong>
                        {assistantNames.length ? (
                          <em>
                            {seriesCohostsConfirmados
                              ? "Cohost técnico verificado"
                              : "Permisos Meet pendientes"}
                          </em>
                        ) : null}
                      </span>
                    </div>
                  </div>

                  <footer className="agenda-meeting-card-footer">
                    <Link className="text-link" href={`/reuniones/${request.id}`}>
                      Ver serie <ArrowRight size={15} />
                    </Link>
                    {links.length === 1 ? (
                      <MeetLinkActions
                        openClassName="secondary-action agenda-meet-action"
                        url={links[0]}
                      />
                    ) : (
                      <span className="muted-text">
                        {links.length > 1
                          ? "Los enlaces están en cada encuentro"
                          : "Enlace Meet pendiente"}
                      </span>
                    )}
                  </footer>
                </article>
              );
            })
          )}
        </section>
      ) : (
        <section
          className="agenda-meeting-list"
          aria-label={isHistory ? "Encuentros anteriores" : "Próximos encuentros"}
        >
          {meetings.length === 0 ? (
            <div className="content-section empty-state">
              <CalendarDays size={24} />
              <p>No hay reuniones que coincidan con la búsqueda.</p>
            </div>
          ) : (
            meetings.map((meeting) => {
              const association = meeting.solicitud.docentePrograma;
              const teacher = association.docente.usuario;
              const event =
                meeting.eventosProveedor.find(
                  ({ proveedor }) => proveedor.tipo === "GOOGLE_MEET"
                ) ?? meeting.eventosProveedor[0];
              const assignment = meeting.asignaciones[0];
              const assistant = assignment?.asistenteTecnico.usuario;
              const assistantName = assistant ? personName(assistant) : null;
              const cohostLabels = cohostsForMeeting(meeting);
              const cohostEmails = [
                ...meeting.cohosts.map(({ cuentaGoogle }) => cuentaGoogle.email),
                ...meeting.cohostEmails.map(({ email }) => email)
              ];
              const cohostsConfirmadosEnMeet = Boolean(
                !event?.errorIntegracion &&
                !event?.operacionPendiente &&
                cohostsConfirmados(
                  event?.payloadUltimo,
                  event?.codigoReunion,
                  event?.cuentaProveedor?.emailOrganizador,
                  cohostEmails
                )
              );
              const guidance = cohostAccountGuidance(cohostEmails);

              return (
                <article className="agenda-meeting-card" key={meeting.id}>
                  <header className="agenda-meeting-card-header">
                    <div className="agenda-meeting-date">
                      <span>{formatDate(meeting.inicioProgramadoAt)}</span>
                      <strong>
                        {formatTime(meeting.inicioProgramadoAt)}–
                        {formatTime(meeting.finProgramadoAt)}
                      </strong>
                    </div>
                    <span className={`status status-${statusTone(meeting.estado)}`}>
                      {statusLabel(meeting.estado)}
                    </span>
                  </header>

                  <div className="agenda-meeting-card-body">
                    <div className="agenda-meeting-primary">
                      <p className="agenda-program-label">{association.programa.nombre}</p>
                      <Link
                        className="agenda-meeting-title"
                        href={`/reuniones/${meeting.solicitud.id}`}
                      >
                        {meeting.solicitud.titulo}
                      </Link>
                      <div className="agenda-teacher-line">
                        <span>Docente</span>
                        {actor.rol === "ADMINISTRACION" ? (
                          <Link
                            className="teacher-meetings-link"
                            href={`/docentes/${teacher.id}/reuniones`}
                          >
                            {personName(teacher)}
                          </Link>
                        ) : (
                          <strong>{personName(teacher)}</strong>
                        )}
                      </div>
                      <span className="agenda-modality-chip">
                        {meeting.solicitud.modalidad === "HIBRIDA" ? "Híbrida" : "Virtual"}
                      </span>
                    </div>

                    <div className="agenda-access-panel">
                      <div
                        className={`agenda-access-block agenda-cohost-block ${
                          cohostLabels.length === 0
                            ? "is-missing"
                            : cohostsConfirmadosEnMeet
                              ? "is-verified"
                              : "is-unverified"
                        }`}
                      >
                        <div className="agenda-cohost-header">
                          <span>
                            Cohost{cohostLabels.length === 1 ? "" : "s"}
                            {cohostLabels.length ? ` · ${guidance}` : ""}
                          </span>
                          {cohostLabels.length ? (
                            cohostsConfirmadosEnMeet ? (
                              <span
                                className="status-badge status-ok"
                                title="Verificado en Google Meet"
                              >
                                <CheckCircle2 size={12} aria-hidden="true" /> Verificado en Meet
                              </span>
                            ) : (
                              <span
                                className="status-badge status-warning"
                                title="Google Meet todavía no confirmó los permisos de cohost"
                              >
                                <AlertTriangle size={12} aria-hidden="true" /> Permisos pendientes en Meet
                              </span>
                            )
                          ) : null}
                        </div>
                        <strong>{cohostPrimaryText(cohostLabels)}</strong>
                        {cohostLabels.length > 2 ? (
                          <small>+{cohostLabels.length - 2} más</small>
                        ) : null}
                      </div>
                      <div className="agenda-access-block agenda-host-reference">
                        <span>Cuenta organizadora</span>
                        <strong>
                          {event?.cuentaProveedor?.emailOrganizador ??
                            event?.cuentaProveedor?.nombre ??
                            "Pendiente"}
                        </strong>
                        <small>Solo referencia · no iniciar sesión.</small>
                        <MeetIntegrationStatus
                          status={event?.estadoIntegracion}
                          hasMeet={Boolean(event?.joinUrl)}
                          hideSettingsWarning={cohostLabels.length > 0}
                        />
                      </div>
                      <div className="agenda-access-block">
                        <span>Código Meet</span>
                        <strong>{event?.codigoReunion ?? "Pendiente"}</strong>
                      </div>
                    </div>

                    <div
                      className={`agenda-assistant ${
                        assistantName
                          ? "has-assistant"
                          : meeting.requiereAsistenciaTecnica
                            ? "needs-assistant"
                            : "no-assistance"
                      }`}
                    >
                      {meeting.requiereAsistenciaTecnica ? (
                        <UserRoundCheck size={20} />
                      ) : (
                        <UserRoundMinus size={20} />
                      )}
                      <span>
                        <small>
                          {assistantName
                            ? (cohostsConfirmadosEnMeet ? "Cohost técnico verificado" : "Asistente (permisos Meet pendientes)")
                            : "Asistencia técnica"}
                        </small>
                        <strong>
                          {assistantName ??
                            (meeting.requiereAsistenciaTecnica
                              ? "Pendiente de asignación"
                              : "No requiere")}
                        </strong>
                        {assistantName ? (
                          <em>
                            {assistant?.emailPrincipal?.endsWith("@flacso.edu.uy")
                              ? "Ingresar con su cuenta personal FLACSO"
                              : "Ingresar con su cuenta Google"}
                          </em>
                        ) : null}
                      </span>
                    </div>
                  </div>

                  <footer className="agenda-meeting-card-footer">
                    <Link className="text-link" href={`/reuniones/${meeting.solicitud.id}`}>
                      Ver detalle <ArrowRight size={15} />
                    </Link>
                    {actor.rol === "ADMINISTRACION" &&
                    !cohostsConfirmadosEnMeet &&
                    cohostLabels.length > 0 &&
                    event?.id &&
                    event.joinUrl ? (
                      <AdminRetryMeetAction
                        eventoProveedorId={event.id}
                        operacion="CONFIGURAR_MEET"
                        label="Verificar cohosts"
                      />
                    ) : null}
                    {event?.joinUrl ? (
                      <MeetLinkActions
                        openClassName="secondary-action agenda-meet-action"
                        url={event.joinUrl}
                      />
                    ) : (
                      <span className="muted-text">Enlace Meet pendiente</span>
                    )}
                  </footer>
                </article>
              );
            })
          )}
        </section>
      )}

      {pagination.totalPaginas > 1 ? (
        <nav className="agenda-pagination" aria-label="Paginación de reuniones">
          <div className="pagination-info">
            Mostrando <strong>{pagination.desdeElemento}–{pagination.hastaElemento}</strong> de{" "}
            <strong>{pagination.totalElementos}</strong>{" "}
            {vista === "series"
              ? pagination.totalElementos === 1
                ? "serie"
                : "series"
              : pagination.totalElementos === 1
                ? "encuentro"
                : "encuentros"}
          </div>
          <div className="pagination-buttons">
            {pagination.tieneAnterior ? (
              <Link
                className="secondary-action pagination-btn"
                href={pageHref({
                  vista,
                  q,
                  programa: programaId,
                  periodo,
                  desde: desdeParam,
                  hasta: hastaParam,
                  page: pagination.paginaActual - 1
                })}
              >
                <ChevronLeft size={16} /> Anterior
              </Link>
            ) : (
              <span className="secondary-action pagination-btn is-disabled" aria-disabled="true">
                <ChevronLeft size={16} /> Anterior
              </span>
            )}
            <span className="pagination-current">
              Página <strong>{pagination.paginaActual}</strong> de{" "}
              <strong>{pagination.totalPaginas}</strong>
            </span>
            {pagination.tieneSiguiente ? (
              <Link
                className="secondary-action pagination-btn"
                href={pageHref({
                  vista,
                  q,
                  programa: programaId,
                  periodo,
                  desde: desdeParam,
                  hasta: hastaParam,
                  page: pagination.paginaActual + 1
                })}
              >
                Siguiente <ChevronRight size={16} />
              </Link>
            ) : (
              <span className="secondary-action pagination-btn is-disabled" aria-disabled="true">
                Siguiente <ChevronRight size={16} />
              </span>
            )}
          </div>
        </nav>
      ) : selectedTotal > 0 ? (
        <div className="pagination-info agenda-total-row">
          Mostrando {selectedTotal}{" "}
          {vista === "series"
            ? selectedTotal === 1
              ? "serie"
              : "series"
            : selectedTotal === 1
              ? "encuentro"
              : "encuentros"}
        </div>
      ) : null}
    </div>
  );
}

function personName(person: { nombres: string; apellidos?: string | null }): string {
  return [person.nombres, person.apellidos].filter(Boolean).join(" ").trim();
}

function cohostsForMeeting(meeting: {
  cohosts: readonly {
    cuentaGoogle: {
      email: string;
      user: { nombres: string; apellidos: string | null };
    };
  }[];
  cohostEmails: readonly { email: string }[];
}): readonly string[] {
  return unique([
    ...meeting.cohosts.map(({ cuentaGoogle }) => {
      const name = personName(cuentaGoogle.user);
      return name ? `${name} · ${cuentaGoogle.email}` : cuentaGoogle.email;
    }),
    ...meeting.cohostEmails.map(({ email }) => email)
  ]);
}

function cohostPrimaryText(labels: readonly string[]): string {
  if (labels.length === 0) return "Sin cohost configurado";
  if (labels.length === 1) return labels[0];
  return labels.slice(0, 2).join(" · ");
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
  const value = (type: "year" | "month" | "day") =>
    parts.find((part) => part.type === type)?.value;
  return new Date(
    `${value("year")}-${value("month")}-${value("day")}T00:00:00-03:00`
  );
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
