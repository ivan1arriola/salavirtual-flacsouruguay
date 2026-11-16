import { Activity, CalendarCheck2, CalendarRange, Clock3, History } from "lucide-react";
import type { Prisma } from "@prisma/client";
import Link from "next/link";
import { redirect } from "next/navigation";
import { auth } from "@/auth";
import { configurarOAuthCalendarioZoom } from "@/src/bootstrap/calendario-zoom-asistente.server";
import { CalendarioZoomAsistente } from "./calendario-zoom-asistente";
import { AssistantMeetingsTable } from "@/src/modules/asistencia/presentation/components/assistant-meetings-table";
import { AssistantMonthList } from "@/src/modules/asistencia/presentation/components/assistant-month-list";
import { AssistantSelfUnassignButton } from "@/src/modules/asistencia/presentation/components/assistant-self-unassign-button";
import { MeetLinkActions } from "@/src/components/copy-meet-link-button";
import { MeetingScheduleTimes } from "@/src/components/meeting-schedule-times";
import { RefreshButton } from "@/src/components/refresh-button";
import { resolveSessionActor } from "@/src/lib/auth/session-actor.adapter";
import { db } from "@/src/lib/db";
import { seleccionarEventoProveedorActivo } from "@/src/modules/reuniones/evento-proveedor-activo.domain";
import { formatMinutes, formatMoney, formatMonth } from "@/src/lib/ui/assistant-format";
import {
  agruparPorDia,
  colorCuentaZoom,
  PALETA_CUENTAS_ZOOM
} from "@/src/modules/reuniones/lista-zoom-agrupacion.domain";
import { obtenerAsistenciasPersonales } from "@/src/modules/asistencia/resumen-personal.adapter";
import {
  agruparPorMes,
  claveMesUtc3,
  resumirAsistencias
} from "@/src/modules/asistencia/resumen-personal.domain";

const upcomingInclude = {
  instancia: {
    include: {
      solicitud: {
        include: {
          docentePrograma: {
            include: { programa: true, docente: { include: { usuario: true } } }
          }
        }
      },
      eventosProveedor: { include: { proveedor: true, cuentaProveedor: true } }
    }
  }
} satisfies Prisma.AsignacionAsistenciaTecnicaInclude;

type UpcomingAssignment = Prisma.AsignacionAsistenciaTecnicaGetPayload<{ include: typeof upcomingInclude }>;

function UpcomingMeeting({
  assignment,
  ahora,
  isNext
}: Readonly<{
  assignment: UpcomingAssignment;
  ahora: Date;
  isNext: boolean;
}>) {
  const meeting = assignment.instancia;
  const association = meeting.solicitud.docentePrograma;
  const teacher = association.docente.usuario;
  const teacherName = [teacher.nombres, teacher.apellidos].filter(Boolean).join(" ");
  const event = seleccionarEventoProveedorActivo(meeting);
  const provider = event?.proveedor.tipo ?? meeting.proveedorActivoTipo;
  const isZoom = provider === "ZOOM" || provider === "ZOOM_HISTORICO";
  const platform = isZoom ? "Zoom" : "Google Meet";
  const host = event?.cuentaProveedor;
  const hostName = host?.emailOrganizador ?? host?.nombre ?? "Sin cuenta asignada";
  const hostColor = colorCuentaZoom(isZoom ? host?.emailOrganizador : null);
  const palette = hostColor === null ? undefined : PALETA_CUENTAS_ZOOM[hostColor];
  const modalidad = meeting.modalidadOverride ?? meeting.solicitud.modalidad;
  const modalityLabel = modalidad === "HIBRIDA" ? "Híbrida" : "Virtual";
  const inicioAsistencia = meeting.inicioAsistenciaTecnicaAt ?? meeting.inicioProgramadoAt;

  return (
    <article className={`assistant-agenda-item${isNext ? " is-next" : ""}`}>
      <div className="assistant-agenda-main">
        <div className="assistant-agenda-main-meta">
          <span>{association.programa.nombre}</span>
          {isNext ? <span className="assistant-agenda-next-label">Próxima</span> : null}
        </div>
        <h4>{meeting.solicitud.titulo}</h4>
        <p>
          {teacherName} · {modalityLabel}
        </p>
      </div>

      <div className="assistant-agenda-schedule">
        <MeetingScheduleTimes
          startsAt={meeting.inicioProgramadoAt}
          endsAt={meeting.finProgramadoAt}
          requiresAssistance
          modality={modalidad}
          assistanceStartsAt={meeting.inicioAsistenciaTecnicaAt}
          assistanceEndsAt={meeting.finAsistenciaTecnicaAt}
          viewerIsAssistant
          compact
          showDetails={false}
        />
      </div>

      <div className="assistant-agenda-room">
        <span>
          {palette ? <i aria-hidden="true" style={{ backgroundColor: palette.fuerte }} /> : null}
          {provider ? `Host de ${platform}` : "Plataforma por confirmar"}
        </span>
        {provider ? <strong>{hostName}</strong> : null}
        {event?.codigoReunion ? (
          <small>
            {isZoom ? "N.º de reunión" : "Código"} {event.codigoReunion}
          </small>
        ) : null}
      </div>

      <div className="assistant-agenda-action">
        <div className="assistant-agenda-primary-actions">
          <Link className="secondary-action" href={`/operacion/${meeting.id}`}>
            <Activity size={15} aria-hidden="true" />
            Operar
          </Link>
          {event?.joinUrl ? (
            <MeetLinkActions
              className="assistant-agenda-link-actions"
              openClassName="assistant-agenda-open-meeting"
              provider={event.proveedor.tipo}
              url={event.joinUrl}
            />
          ) : (
            <span className="status status-warning">Enlace pendiente</span>
          )}
        </div>
        {inicioAsistencia.getTime() > ahora.getTime() ? (
          <details className="assistant-agenda-more">
            <summary>Más acciones</summary>
            <AssistantSelfUnassignButton assignmentId={assignment.id} title={meeting.solicitud.titulo} />
          </details>
        ) : null}
      </div>
    </article>
  );
}

function UpcomingMeetings({
  assignments,
  ahora
}: Readonly<{ assignments: readonly UpcomingAssignment[]; ahora: Date }>) {
  if (assignments.length === 0) {
    return (
      <section className="content-section">
        <div className="empty-state">
          <CalendarCheck2 size={24} aria-hidden="true" />
          <p>No tenés reuniones asignadas próximamente.</p>
        </div>
      </section>
    );
  }

  const months = new Set(assignments.map(({ instancia }) => claveMesUtc3(instancia.inicioProgramadoAt)));
  const upcomingPeriods = [...months].map((clave) => {
    const monthAssignments = assignments.filter(
      ({ instancia }) => claveMesUtc3(instancia.inicioProgramadoAt) === clave
    );
    return {
      clave,
      fecha: monthAssignments[0].instancia.inicioProgramadoAt,
      cantidad: monthAssignments.length,
      dias: agruparPorDia(monthAssignments, ({ instancia }) => instancia.inicioProgramadoAt, ahora)
    };
  });
  const nextAssignmentId = assignments[0]?.id;

  return (
    <div className="period-list assistant-agenda-periods">
      {upcomingPeriods.map((period) => (
        <section className="content-section assistant-agenda-month" key={period.clave}>
          <div className="section-heading assistant-agenda-month-heading">
            <h2>{formatMonth(period.fecha)}</h2>
            <span className="assistant-agenda-count">
              {period.cantidad} {period.cantidad === 1 ? "reunión" : "reuniones"}
            </span>
          </div>

          {period.dias.map((dia) => (
            <section className="assistant-agenda-day" aria-label={dia.etiqueta} key={dia.clave}>
              <h3>{dia.etiqueta}</h3>
              {dia.items.map((assignment) => (
                <UpcomingMeeting
                  key={assignment.id}
                  assignment={assignment}
                  ahora={ahora}
                  isNext={assignment.id === nextAssignmentId}
                />
              ))}
            </section>
          ))}
        </section>
      ))}
    </div>
  );
}

export default async function MiAgendaPage({
  searchParams
}: Readonly<{
  searchParams?: Promise<{ tab?: string; calendario?: string }>;
}>) {
  const session = await auth();
  if (!session?.user) {
    redirect("/acceso");
  }
  const actor = await resolveSessionActor(db, {
    id: session.user.id,
    email: session.user.email
  });
  if (!actor?.activo || actor.rol !== "ASISTENTE_TECNICO") {
    redirect("/");
  }

  const assistant = await db.asistenteTecnico.findUnique({
    where: { usuarioId: actor.id },
    select: {
      id: true,
      calendarioZoom: { select: { email: true, ultimoIntentoAt: true, error: true } }
    }
  });
  if (!assistant) {
    redirect("/");
  }

  const resolvedParams = searchParams ? await searchParams : {};
  const requestedTab = resolvedParams.tab;
  const activeTab = requestedTab === "mes" || requestedTab === "historico" ? requestedTab : "proximas";
  const ahora = new Date();

  const [upcomingAssignments, monthMeetings, historyMeetings, upcomingCount] = await Promise.all([
    activeTab === "proximas"
      ? db.asignacionAsistenciaTecnica.findMany({
          where: {
            asistenteTecnicoId: assistant.id,
            estado: { in: ["ASIGNADO", "ACEPTADO"] },
            instancia: {
              estado: "PROGRAMADA",
              OR: [
                { finAsistenciaTecnicaAt: { gte: ahora } },
                { finAsistenciaTecnicaAt: null, finProgramadoAt: { gte: ahora } }
              ]
            }
          },
          orderBy: { instancia: { inicioProgramadoAt: "asc" } },
          include: upcomingInclude
        })
      : Promise.resolve([]),
    activeTab === "mes"
      ? obtenerAsistenciasPersonales(db, actor.id, "MES_ACTUAL", ahora)
      : Promise.resolve([]),
    activeTab === "historico"
      ? obtenerAsistenciasPersonales(db, actor.id, "HISTORICO", ahora)
      : Promise.resolve([]),
    db.asignacionAsistenciaTecnica.count({
      where: {
        asistenteTecnicoId: assistant.id,
        estado: { in: ["ASIGNADO", "ACEPTADO"] },
        instancia: {
          estado: "PROGRAMADA",
          OR: [
            { finAsistenciaTecnicaAt: { gte: ahora } },
            { finAsistenciaTecnicaAt: null, finProgramadoAt: { gte: ahora } }
          ]
        }
      }
    })
  ]);

  const monthSummary = resumirAsistencias(monthMeetings);
  const historyPeriods = agruparPorMes(historyMeetings);

  return (
    <div className="assistant-agenda-page">
      <header className="page-header assistant-agenda-header">
        <div>
          <p className="page-eyebrow">Monitoreo</p>
          <h1>Mi agenda</h1>
          {activeTab === "mes" && <p>Reuniones, horas e importes estimados de {formatMonth(ahora)}.</p>}
          {activeTab === "historico" ? <p>Horas e importes personales de meses anteriores.</p> : null}
        </div>
        {activeTab === "mes" ? <RefreshButton /> : null}
      </header>

      <nav className="assistant-tabs" aria-label="Secciones de Mi agenda">
        <Link
          aria-current={activeTab === "proximas" ? "page" : undefined}
          className={`assistant-tab${activeTab === "proximas" ? " is-active" : ""}`}
          href="/mi-agenda"
        >
          <CalendarCheck2 size={16} aria-hidden="true" />
          <span>Próximas</span>
          {upcomingCount > 0 ? <span className="tab-pill">{upcomingCount}</span> : null}
        </Link>
        <Link
          aria-current={activeTab === "mes" ? "page" : undefined}
          className={`assistant-tab${activeTab === "mes" ? " is-active" : ""}`}
          href="/mi-agenda?tab=mes"
        >
          <CalendarRange size={16} aria-hidden="true" />
          <span>Mes</span>
        </Link>
        <Link
          aria-current={activeTab === "historico" ? "page" : undefined}
          className={`assistant-tab${activeTab === "historico" ? " is-active" : ""}`}
          href="/mi-agenda?tab=historico"
        >
          <History size={16} aria-hidden="true" />
          <span>Histórico</span>
        </Link>
      </nav>

      {activeTab === "proximas" ? <UpcomingMeetings assignments={upcomingAssignments} ahora={ahora} /> : null}

      {activeTab === "proximas" && configurarOAuthCalendarioZoom() ? (
        <CalendarioZoomAsistente conexion={assistant.calendarioZoom} estado={resolvedParams.calendario} />
      ) : null}

      {activeTab === "mes" && (
        <>
          <div data-tour="assistant-month-summary">
            <section className="assistant-mode-grid" aria-label="Resumen del mes">
              <div className="mode-summary virtual-summary">
                <Clock3 size={28} />
                <span>
                  <small>Virtuales</small>
                  <strong>{formatMinutes(monthSummary.minutosVirtuales)}</strong>
                  <b>{formatMoney(monthSummary.montoVirtual)}</b>
                </span>
              </div>
              <div className="mode-summary hybrid-summary">
                <Clock3 size={28} />
                <span>
                  <small>Híbridas</small>
                  <strong>{formatMinutes(monthSummary.minutosHibridos)}</strong>
                  <b>{formatMoney(monthSummary.montoHibrido)}</b>
                </span>
              </div>
            </section>
            <div className="estimated-total">
              Cotización total estimada: <strong>{formatMoney(monthSummary.monto)}</strong>
            </div>
          </div>

          <section className="month-meetings" data-tour="assistant-month-list">
            {monthMeetings.length === 0 ? (
              <div className="empty-state">
                <CalendarRange size={24} />
                <p>No tenés reuniones asignadas este mes.</p>
              </div>
            ) : (
              <AssistantMonthList meetings={monthMeetings} />
            )}
          </section>
        </>
      )}

      {activeTab === "historico" &&
        (historyPeriods.length === 0 ? (
          <section className="content-section">
            <div className="empty-state">
              <History size={24} />
              <p>Todavía no tenés reuniones en meses anteriores.</p>
            </div>
          </section>
        ) : (
          <div className="period-list">
            {historyPeriods.map((period) => {
              const periodSummary = resumirAsistencias(period.registros);
              return (
                <section className="content-section" key={period.clave}>
                  <div className="section-heading">
                    <div>
                      <h2>{formatMonth(period.registros[0].inicioAt)}</h2>
                      <p>
                        {periodSummary.reuniones} reuniones ·{" "}
                        {formatMinutes(periodSummary.minutosVirtuales + periodSummary.minutosHibridos)} horas
                        · {formatMoney(periodSummary.monto)}
                      </p>
                    </div>
                  </div>
                  <AssistantMeetingsTable meetings={period.registros} />
                </section>
              );
            })}
          </div>
        ))}
    </div>
  );
}
