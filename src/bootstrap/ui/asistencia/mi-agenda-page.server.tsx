import { Activity, CalendarCheck2, CalendarRange, Clock3, History } from "lucide-react";
import Link from "next/link";
import { redirect } from "next/navigation";
import { auth } from "@/auth";
import { AssistantMeetingsTable } from "@/src/modules/asistencia/presentation/components/assistant-meetings-table";
import { AssistantMonthList } from "@/src/modules/asistencia/presentation/components/assistant-month-list";
import { MeetLinkActions } from "@/src/components/copy-meet-link-button";
import { RefreshButton } from "@/src/components/refresh-button";
import { resolveSessionActor } from "@/src/lib/auth/session-actor.adapter";
import { db } from "@/src/lib/db";
import { formatMinutes, formatMoney, formatMonth } from "@/src/lib/ui/assistant-format";
import { formatDate, formatTime } from "@/src/lib/ui/format";
import { obtenerAsistenciasPersonales } from "@/src/modules/asistencia/resumen-personal.adapter";
import {
  agruparPorMes,
  claveMesUtc3,
  resumirAsistencias
} from "@/src/modules/asistencia/resumen-personal.domain";

export default async function MiAgendaPage({
  searchParams
}: Readonly<{
  searchParams?: Promise<{ tab?: string }>;
}>) {
  const session = await auth();
  if (!session?.user) redirect("/acceso");
  const actor = await resolveSessionActor(db, {
    id: session.user.id,
    email: session.user.email
  });
  if (!actor?.activo || actor.rol !== "ASISTENTE_TECNICO") redirect("/");

  const assistant = await db.asistenteTecnico.findUnique({
    where: { usuarioId: actor.id },
    select: { id: true }
  });
  if (!assistant) redirect("/");

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
              finProgramadoAt: { gte: ahora },
              estado: "PROGRAMADA"
            }
          },
          orderBy: { instancia: { inicioProgramadoAt: "asc" } },
          include: {
            instancia: {
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
                eventosProveedor: { include: { proveedor: true, cuentaProveedor: true } }
              }
            }
          }
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
          finProgramadoAt: { gte: ahora },
          estado: "PROGRAMADA"
        }
      }
    })
  ]);

  const upcomingPeriods = [...new Set(
    upcomingAssignments.map(({ instancia }) => claveMesUtc3(instancia.inicioProgramadoAt))
  )].map((clave) => ({
    clave,
    assignments: upcomingAssignments.filter(
      ({ instancia }) => claveMesUtc3(instancia.inicioProgramadoAt) === clave
    )
  }));
  const nextAssignment = upcomingAssignments[0];

  const monthSummary = resumirAsistencias(monthMeetings);
  const historyPeriods = agruparPorMes(historyMeetings);

  return (
    <div className="assistant-agenda-page">
      <header className="page-header assistant-agenda-header">
        <div>
          <p className="page-eyebrow">Asistencia técnica</p>
          <h1>Mi agenda</h1>
          <p>
            {activeTab === "proximas" && (
              upcomingCount === 1 ? "1 reunión próxima asignada." : `${upcomingCount} reuniones próximas asignadas.`
            )}
            {activeTab === "mes" && `Reuniones, horas e importes estimados de ${formatMonth(ahora)}.`}
            {activeTab === "historico" && "Horas e importes personales de meses anteriores."}
          </p>
        </div>
        {activeTab === "proximas" && nextAssignment ? (
          <div className="assistant-agenda-next-summary">
            <CalendarCheck2 size={19} aria-hidden="true" />
            <span>
              <small>Próxima reunión</small>
              <strong>{formatDate(nextAssignment.instancia.inicioProgramadoAt)} · {formatTime(nextAssignment.instancia.inicioProgramadoAt)}</strong>
            </span>
          </div>
        ) : activeTab === "mes" ? (
          <RefreshButton />
        ) : (
          <CalendarCheck2 size={28} color="var(--brand)" aria-hidden="true" />
        )}
      </header>

      <nav className="assistant-tabs" aria-label="Secciones de Mi agenda">
        <Link
          className={`assistant-tab${activeTab === "proximas" ? " is-active" : ""}`}
          href="/mi-agenda"
        >
          <CalendarCheck2 size={16} aria-hidden="true" />
          <span>Próximas</span>
          {upcomingCount > 0 ? <span className="tab-pill">{upcomingCount}</span> : null}
        </Link>
        <Link
          className={`assistant-tab${activeTab === "mes" ? " is-active" : ""}`}
          href="/mi-agenda?tab=mes"
        >
          <CalendarRange size={16} aria-hidden="true" />
          <span>Mes</span>
        </Link>
        <Link
          className={`assistant-tab${activeTab === "historico" ? " is-active" : ""}`}
          href="/mi-agenda?tab=historico"
        >
          <History size={16} aria-hidden="true" />
          <span>Histórico</span>
        </Link>
      </nav>

      {activeTab === "proximas" && (
        upcomingAssignments.length === 0 ? (
          <section className="content-section">
            <div className="empty-state">
              <CalendarCheck2 size={24} aria-hidden="true" />
              <p>No tenés reuniones asignadas próximamente.</p>
            </div>
          </section>
        ) : (
          <div className="period-list assistant-agenda-periods">
            {upcomingPeriods.map((period) => (
              <section className="content-section assistant-agenda-month" key={period.clave}>
                <div className="section-heading assistant-agenda-month-heading">
                  <div>
                    <p className="assistant-agenda-month-eyebrow">Agenda mensual</p>
                    <h2>{formatMonth(period.assignments[0].instancia.inicioProgramadoAt)}</h2>
                  </div>
                  <span className="assistant-agenda-count">
                    {period.assignments.length} {period.assignments.length === 1 ? "reunión" : "reuniones"}
                  </span>
                </div>

                <div className="assistant-agenda-list">
                  {period.assignments.map((assignment) => {
                    const meeting = assignment.instancia;
                    const association = meeting.solicitud.docentePrograma;
                    const teacher = association.docente.usuario;
                    const meet = meeting.eventosProveedor.find(
                      ({ proveedor }) => proveedor.tipo === "GOOGLE_MEET"
                    );
                    const isNext = assignment.id === nextAssignment?.id;
                    const roomName = meet?.cuentaProveedor?.emailOrganizador
                      ?? meet?.cuentaProveedor?.nombre
                      ?? "Sin cuenta asignada";

                    return (
                      <article className={`assistant-agenda-item${isNext ? " is-next" : ""}`} key={assignment.id}>
                        <div className="assistant-agenda-date-block">
                          <span>{formatDate(meeting.inicioProgramadoAt)}</span>
                          <strong>{formatTime(meeting.inicioProgramadoAt)}–{formatTime(meeting.finProgramadoAt)}</strong>
                          {isNext ? <em>Próxima</em> : null}
                        </div>

                        <div className="assistant-agenda-main">
                          <div className="assistant-agenda-main-meta">
                            <span>{association.programa.nombre}</span>
                            <span className="assistant-agenda-mode">
                              {meeting.solicitud.modalidad === "HIBRIDA" ? "Híbrida" : "Virtual"}
                            </span>
                          </div>
                          <h3>{meeting.solicitud.titulo}</h3>
                          <p>{teacher.nombres} {teacher.apellidos}</p>
                        </div>

                        <div className="assistant-agenda-room">
                          <span>Cuenta Meet</span>
                          <strong>{roomName}</strong>
                          <small>{meet?.codigoReunion ?? "Meet pendiente"}</small>
                        </div>

                        <div className="assistant-agenda-action">
                          <Link className="secondary-action" href={`/operacion/${meeting.id}`}>
                            <Activity size={15} aria-hidden="true" />
                            Operar
                          </Link>
                          {meet?.joinUrl ? (
                            <MeetLinkActions
                              className="assistant-agenda-link-actions"
                              openClassName="assistant-agenda-open-meet"
                              url={meet.joinUrl}
                            />
                          ) : (
                            <span className="status status-warning">Meet pendiente</span>
                          )}
                        </div>
                      </article>
                    );
                  })}
                </div>
              </section>
            ))}
          </div>
        )
      )}

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

      {activeTab === "historico" && (
        historyPeriods.length === 0 ? (
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
                        {periodSummary.reuniones} reuniones · {formatMinutes(periodSummary.minutosVirtuales + periodSummary.minutosHibridos)} horas · {formatMoney(periodSummary.monto)}
                      </p>
                    </div>
                  </div>
                  <AssistantMeetingsTable meetings={period.registros} />
                </section>
              );
            })}
          </div>
        )
      )}
    </div>
  );
}
