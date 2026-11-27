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
import { ProveedorTabs } from "@/src/components/proveedor-tabs";
import { MeetingScheduleTimes } from "@/src/components/meeting-schedule-times";
import { MeetIntegrationStatus, MeetPendingNotice } from "@/src/components/meet-integration-status";
import { AdminRetryMeetAction } from "@/src/components/admin-attention-actions";
import { resolveSessionActor } from "@/src/lib/auth/session-actor.adapter";
import { db } from "@/src/lib/db";
import { formatDate, formatShortDate, formatTime } from "@/src/lib/ui/format";
import {
  obtenerDatosPaginaReuniones,
  type PeriodoAgenda
} from "@/src/modules/reuniones/reuniones-page.service";
import { puedeVerAgendaCompleta } from "@/src/modules/reuniones/reuniones.domain";
import { seleccionarEventoProveedorActivo } from "@/src/modules/reuniones/evento-proveedor-activo.domain";
import {
  cohostAccountGuidance,
  cohostsConfirmados,
  extraerCohostEmailsDeInstancia,
  extraerCohostsUnificadosDeInstancia
} from "@/src/modules/conferencias/api";

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
    proveedor?: string;
  }>;
}>) {
  const session = await auth();
  if (!session?.user) {
    redirect("/acceso");
  }

  const actor = await resolveSessionActor(db, {
    id: session.user.id,
    email: session.user.email
  });
  if (!actor?.activo || !puedeVerAgendaCompleta(actor.rol)) {
    redirect("/mi-agenda");
  }

  const params = await searchParams;
  const now = new Date();

  const {
    vista,
    q,
    programaId,
    periodo,
    isHistory,
    pagination,
    totalMeetings,
    totalSeries,
    selectedTotal,
    meetings,
    series,
    programs,
    todayCount,
    nextWeekCount,
    lastSevenDaysCount,
    lastThirtyDaysCount,
    pendingAssistanceCount,
    hasPendingMeet,
    desdeParam,
    hastaParam
  } = await obtenerDatosPaginaReuniones(db, actor, { ...params, proveedor: "meet" });

  return (
    <div
      className={`meetings-agenda-page agenda-v2 ${actor.rol === "ADMINISTRACION" ? "agenda-admin-view" : "agenda-role-view"}`}
    >
      <ProveedorTabs
        activo="GOOGLE_MEET"
        filtros={{
          vista,
          q,
          programa: programaId,
          periodo,
          desde: desdeParam,
          hasta: hastaParam
        }}
      />

      <header className="meetings-agenda-hero">
        <div>
          <p className="page-eyebrow">{formatShortDate(now)}</p>
          <h1>Agenda de reuniones</h1>
          <p>
            {isHistory
              ? "Reuniones de días anteriores."
              : "Reuniones de hoy y próximas, cohosts y cobertura de monitoreo."}
          </p>
        </div>
        <Link className="primary-action" href="/reuniones/nueva">
          <CalendarPlus size={18} />
          Nueva reunión
        </Link>
      </header>

      {actor.rol === "ADMINISTRACION" && (
        <div>
          <Link className="secondary-action" href="/reuniones/buscar-meet">
            <Search size={17} aria-hidden="true" /> Buscar por enlace o código Meet
          </Link>{" "}
          <Link className="secondary-action" href="/reuniones/migracion-zoom">
            Migración a Zoom
          </Link>
        </div>
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
              Hoy y próximas <small>desde medianoche</small>
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

      <section className="agenda-summary-grid admin-agenda-summary" aria-label="Resumen de agenda">
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
            <small>Sin monitoreo</small>
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
          <input name="proveedor" type="hidden" value="meet" />
          {actor.rol === "ADMINISTRACION" ? <input name="periodo" type="hidden" value={periodo} /> : null}

          <input
            className="agenda-advanced-checkbox"
            id="agenda-advanced-toggle"
            type="checkbox"
            defaultChecked={Boolean(programaId || desdeParam || hastaParam)}
            aria-label="Mostrar filtros avanzados"
          />
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

          <button className="secondary-action agenda-mobile-search-submit" type="submit">
            <Search size={17} aria-hidden="true" /> Buscar
          </button>
          <label className="agenda-mobile-filters-toggle" htmlFor="agenda-advanced-toggle">
            <span>Filtros avanzados{programaId || desdeParam || hastaParam ? " · activos" : ""}</span>
            <ChevronRight size={16} aria-hidden="true" />
          </label>
          <div className="agenda-advanced-fields">
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
                <input aria-label="Fecha desde" defaultValue={desdeParam} name="desde" type="date" />
              </label>
              <label className="agenda-date-label">
                <span>Hasta</span>
                <input aria-label="Fecha hasta" defaultValue={hastaParam} name="hasta" type="date" />
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
              const events = seriesMeetings.flatMap((meeting) => {
                const active = seleccionarEventoProveedorActivo(meeting);
                return active ? [active] : [];
              });
              const organizers = unique(
                events.flatMap(({ cuentaProveedor }) => {
                  const account = cuentaProveedor?.emailOrganizador ?? cuentaProveedor?.nombre;
                  return account ? [account] : [];
                })
              );
              const codes = unique(
                events.flatMap(({ proveedor, codigoReunion }) =>
                  proveedor.tipo === "GOOGLE_MEET" && codigoReunion ? [codigoReunion] : []
                )
              );
              const links = unique(events.flatMap(({ joinUrl }) => (joinUrl ? [joinUrl] : [])));
              const cohostLabels = unique(seriesMeetings.flatMap((meeting) => cohostsForMeeting(meeting)));
              const seriesCohostEmails = unique(
                seriesMeetings.flatMap((meeting) => extraerCohostEmailsDeInstancia(meeting))
              );
              const seriesCohostsConfirmados = Boolean(
                seriesCohostEmails.length > 0 &&
                seriesMeetings.every((meeting) => {
                  const meetingCohostEmails = extraerCohostEmailsDeInstancia(meeting);
                  if (meetingCohostEmails.length === 0) {
                    return true;
                  }
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
                          ? `Encuentros: ${formatTime(first.inicioProgramadoAt)}–${formatTime(first.finProgramadoAt)}`
                          : "Horarios de encuentros variables"}
                      </strong>
                    </div>
                    <span className="status status-ok">
                      {seriesMeetings.length} {seriesMeetings.length === 1 ? "encuentro" : "encuentros"}
                    </span>
                  </header>

                  <div className="agenda-meeting-card-body">
                    <div className="agenda-meeting-primary">
                      <p className="agenda-program-label">{association.programa.nombre}</p>
                      <MeetingScheduleTimes
                        startsAt={first.inicioProgramadoAt}
                        endsAt={first.finProgramadoAt}
                        requiresAssistance={first.requiereAsistenciaTecnica}
                        modality={first.modalidadOverride ?? first.solicitud.modalidad}
                        assistanceStartsAt={first.inicioAsistenciaTecnicaAt}
                        assistanceEndsAt={first.finAsistenciaTecnicaAt}
                        compact
                      />
                      <Link className="agenda-meeting-title" href={`/reuniones/${request.id}`}>
                        {request.titulo}
                      </Link>
                      <div className="agenda-teacher-line">
                        <span>Docente</span>
                        {actor.rol === "ADMINISTRACION" ? (
                          <Link className="teacher-meetings-link" href={`/docentes/${teacher.id}/reuniones`}>
                            {personName(teacher)}
                          </Link>
                        ) : (
                          <strong>{personName(teacher)}</strong>
                        )}
                      </div>
                      <span className="agenda-modality-chip">
                        {request.modalidad === "HIBRIDA" ? "Híbrida" : "Virtual"}
                      </span>
                      <div className="agenda-mobile-glance" aria-label="Estado operativo de la serie">
                        <span
                          className={
                            cohostLabels.length === 0
                              ? "is-neutral"
                              : seriesCohostsConfirmados
                                ? "is-ok"
                                : "is-warning"
                          }
                        >
                          {cohostLabels.length && seriesCohostsConfirmados ? (
                            <CheckCircle2 size={14} aria-hidden="true" />
                          ) : cohostLabels.length ? (
                            <AlertTriangle size={14} aria-hidden="true" />
                          ) : (
                            <UserRoundMinus size={14} aria-hidden="true" />
                          )}
                          {cohostLabels.length === 0
                            ? "Sin cohosts"
                            : seriesCohostsConfirmados
                              ? "Cohosts confirmados"
                              : "Cohosts por verificar"}
                        </span>
                        <span className={pendingSeriesAssistance ? "is-warning" : "is-neutral"}>
                          <UserRoundCheck size={14} aria-hidden="true" />
                          {pendingSeriesAssistance
                            ? `${pendingSeriesAssistance} asistencias sin asignar`
                            : requiredAssistance.length
                              ? "Monitoreo asignado"
                              : "No requiere monitoreo"}
                        </span>
                      </div>
                      <input
                        className="agenda-mobile-details-input"
                        id={`agenda-details-${request.id}`}
                        type="checkbox"
                      />
                      <label
                        className="agenda-mobile-details-control"
                        htmlFor={`agenda-details-${request.id}`}
                      >
                        Detalles técnicos <ChevronRight size={16} aria-hidden="true" />
                      </label>
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
                              <span className="status-badge status-ok" title="Verificado en Google Meet">
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
                        <small>Monitoreo</small>
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
                      <MeetLinkActions openClassName="secondary-action agenda-meet-action" url={links[0]} />
                    ) : (
                      <span className="muted-text">
                        {links.length > 1 ? "Los enlaces están en cada encuentro" : "Enlace Meet pendiente"}
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
              // El enlace y la cuenta visibles siguen al proveedor activo; los
              // cohosts se verifican solo contra el evento de Google Meet.
              const activeEvent = seleccionarEventoProveedorActivo(meeting) ?? meeting.eventosProveedor[0];
              const event = meeting.eventosProveedor.find(
                ({ proveedor }) => proveedor.tipo === "GOOGLE_MEET"
              );
              const assignment = meeting.asignaciones[0];
              const assistant = assignment?.asistenteTecnico.usuario;
              const assistantName = assistant ? personName(assistant) : null;
              const cohostLabels = cohostsForMeeting(meeting);
              const cohostEmails = extraerCohostEmailsDeInstancia(meeting);
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
                        Encuentro: {formatTime(meeting.inicioProgramadoAt)}–
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
                      <MeetingScheduleTimes
                        startsAt={meeting.inicioProgramadoAt}
                        endsAt={meeting.finProgramadoAt}
                        requiresAssistance={meeting.requiereAsistenciaTecnica}
                        modality={meeting.modalidadOverride ?? meeting.solicitud.modalidad}
                        assistanceStartsAt={meeting.inicioAsistenciaTecnicaAt}
                        assistanceEndsAt={meeting.finAsistenciaTecnicaAt}
                        compact
                      />
                      <Link className="agenda-meeting-title" href={`/reuniones/${meeting.solicitud.id}`}>
                        {meeting.solicitud.titulo}
                      </Link>
                      <div className="agenda-teacher-line">
                        <span>Docente</span>
                        {actor.rol === "ADMINISTRACION" ? (
                          <Link className="teacher-meetings-link" href={`/docentes/${teacher.id}/reuniones`}>
                            {personName(teacher)}
                          </Link>
                        ) : (
                          <strong>{personName(teacher)}</strong>
                        )}
                      </div>
                      <span className="agenda-modality-chip">
                        {(meeting.modalidadOverride ?? meeting.solicitud.modalidad) === "HIBRIDA"
                          ? "Híbrida"
                          : "Virtual"}
                      </span>
                      <div className="agenda-mobile-glance" aria-label="Estado operativo del encuentro">
                        <span
                          className={
                            cohostLabels.length === 0
                              ? "is-neutral"
                              : cohostsConfirmadosEnMeet
                                ? "is-ok"
                                : "is-warning"
                          }
                        >
                          {cohostLabels.length && cohostsConfirmadosEnMeet ? (
                            <CheckCircle2 size={14} aria-hidden="true" />
                          ) : cohostLabels.length ? (
                            <AlertTriangle size={14} aria-hidden="true" />
                          ) : (
                            <UserRoundMinus size={14} aria-hidden="true" />
                          )}
                          {cohostLabels.length === 0
                            ? "Sin cohosts"
                            : cohostsConfirmadosEnMeet
                              ? "Cohosts confirmados"
                              : "Cohosts por verificar"}
                        </span>
                        <span
                          className={
                            meeting.requiereAsistenciaTecnica && !assistantName ? "is-warning" : "is-neutral"
                          }
                        >
                          <UserRoundCheck size={14} aria-hidden="true" />
                          {assistantName
                            ? assistantName
                            : meeting.requiereAsistenciaTecnica
                              ? "Monitoreo sin asignar"
                              : "No requiere monitoreo"}
                        </span>
                      </div>
                      <input
                        className="agenda-mobile-details-input"
                        id={`agenda-details-${meeting.id}`}
                        type="checkbox"
                      />
                      <label
                        className="agenda-mobile-details-control"
                        htmlFor={`agenda-details-${meeting.id}`}
                      >
                        Detalles técnicos <ChevronRight size={16} aria-hidden="true" />
                      </label>
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
                              <span className="status-badge status-ok" title="Verificado en Google Meet">
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
                        {cohostLabels.length > 2 ? <small>+{cohostLabels.length - 2} más</small> : null}
                      </div>
                      <div className="agenda-access-block agenda-host-reference">
                        <span>Cuenta organizadora</span>
                        <strong>
                          {activeEvent?.cuentaProveedor?.emailOrganizador ??
                            activeEvent?.cuentaProveedor?.nombre ??
                            "Pendiente"}
                        </strong>
                        <small>Solo referencia · no iniciar sesión.</small>
                        <MeetIntegrationStatus
                          status={activeEvent?.estadoIntegracion}
                          hasMeet={Boolean(activeEvent?.joinUrl)}
                          hideSettingsWarning={cohostLabels.length > 0}
                        />
                      </div>
                      <div className="agenda-access-block">
                        <span>Código Meet</span>
                        <strong>
                          {(activeEvent?.proveedor.tipo === "GOOGLE_MEET"
                            ? activeEvent.codigoReunion
                            : null) ?? "Pendiente"}
                        </strong>
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
                            ? cohostsConfirmadosEnMeet
                              ? "Cohost técnico verificado"
                              : "Asistente (permisos Meet pendientes)"
                            : "Monitoreo"}
                        </small>
                        <strong>
                          {assistantName ??
                            (meeting.requiereAsistenciaTecnica ? "Pendiente de asignación" : "No requiere")}
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
                    activeEvent?.proveedor.tipo === "GOOGLE_MEET" &&
                    event?.id &&
                    event.joinUrl ? (
                      <AdminRetryMeetAction
                        eventoProveedorId={event.id}
                        operacion="CONFIGURAR_MEET"
                        label="Verificar cohosts"
                      />
                    ) : null}
                    {activeEvent?.joinUrl ? (
                      <MeetLinkActions
                        openClassName="secondary-action agenda-meet-action"
                        url={activeEvent.joinUrl}
                      />
                    ) : (
                      <span className="muted-text">Enlace pendiente</span>
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
            Mostrando{" "}
            <strong>
              {pagination.desdeElemento}–{pagination.hastaElemento}
            </strong>{" "}
            de <strong>{pagination.totalElementos}</strong>{" "}
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
              Página <strong>{pagination.paginaActual}</strong> de <strong>{pagination.totalPaginas}</strong>
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
  return unique(
    extraerCohostsUnificadosDeInstancia(meeting).map((c) => (c.name ? `${c.name} · ${c.email}` : c.email))
  );
}

function cohostPrimaryText(labels: readonly string[]): string {
  if (labels.length === 0) {
    return "Sin cohost configurado";
  }
  if (labels.length === 1) {
    return labels[0];
  }
  return labels.slice(0, 2).join(" · ");
}

function statusTone(status: string): string {
  if (status === "CANCELADA" || status === "NO_REALIZADA") {
    return "error";
  }
  if (status === "FINALIZADA") {
    return "neutral";
  }
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
  search.set("proveedor", "meet");
  if (params.q) {
    search.set("q", params.q);
  }
  if (params.programa) {
    search.set("programa", params.programa);
  }
  if (params.periodo === "anteriores") {
    search.set("periodo", params.periodo);
  }
  if (params.desde) {
    search.set("desde", params.desde);
  }
  if (params.hasta) {
    search.set("hasta", params.hasta);
  }
  if (params.page && params.page > 1) {
    search.set("page", String(params.page));
  }
  return `/reuniones?${search.toString()}`;
}

function unique(values: readonly string[]): readonly string[] {
  return [...new Set(values)];
}
