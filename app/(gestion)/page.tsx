import {
  AlertTriangle,
  ArrowRight,
  CalendarClock,
  CalendarDays,
  CalendarPlus,
  CheckCircle2,
  CircleAlert,
  ClipboardList,
  Files,
  GitCompareArrows,
  Siren,
  UserRoundCheck
} from "lucide-react";
import Link from "next/link";
import { redirect } from "next/navigation";
import { auth } from "@/auth";
import { AssistantDashboard } from "@/src/components/assistant-dashboard";
import { CopyMeetLinkButton } from "@/src/components/copy-meet-link-button";
import {
  AdminQuickAssignAction,
  AdminRetryMeetAction,
  AdminSyncRecordingsAction
} from "@/src/components/admin-attention-actions";
import { MeetIntegrationStatus, MeetPendingNotice } from "@/src/components/meet-integration-status";
import { TeacherDashboard } from "@/src/components/teacher-dashboard";
import { db } from "@/src/lib/db";
import { formatDate, formatShortDate, formatTime } from "@/src/lib/ui/format";
import { listarCasosRevisionDuplicados } from "@/src/modules/reuniones/duplicados.service";
import { cohostsConfirmados } from "@/src/modules/meet/cohost-verification.domain";
import { cohostAccountGuidance } from "@/src/modules/meet/cohosts.domain";

export default async function HomePage() {
  const session = await auth();
  if (!session?.user) redirect("/acceso");
  if (session.user.role === "ASISTENTE_TECNICO") return <AssistantDashboard user={session.user} />;
  if (session.user.role === "DOCENTE") return <TeacherDashboard user={session.user} />;

  const now = new Date();
  const todayStart = startOfMontevideoDay(now);
  const todayEnd = new Date(todayStart.getTime() + 24 * 60 * 60 * 1000);
  const weekEnd = new Date(now.getTime() + 7 * 24 * 60 * 60 * 1000);
  const recordingLookback = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);
  const [
    openRequests,
    todayMeetings,
    weekMeetings,
    pendingAssistance,
    integrationErrors,
    pendingRecordingCount,
    openIncidentCount,
    upcoming,
    pendingCoverageExamples,
    integrationErrorExamples,
    pendingRecordingExamples,
    openIncidents,
    duplicateCases,
    activeAssistants
  ] =
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
          requiereAsistenciaTecnica: true,
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
      db.eventoProveedor.count({
        where: {
          proveedor: { tipo: "GOOGLE_MEET" },
          estadoIntegracion: "SINCRONIZADA",
          archivosSincronizadosAt: null,
          instancia: {
            requiereGrabacion: true,
            finProgramadoAt: { gte: recordingLookback, lt: now },
            estado: { notIn: ["CANCELADA", "NO_REALIZADA"] }
          }
        }
      }),
      db.incidencia.count({ where: { estado: { in: ["ABIERTA", "EN_ANALISIS"] } } }),
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
          cohosts: {
            include: {
              cuentaGoogle: { include: { user: true } }
            }
          },
          cohostEmails: true,
          asignaciones: {
            where: { estado: { in: ["ASIGNADO", "ACEPTADO"] } },
            include: { asistenteTecnico: { include: { usuario: true } } },
            take: 1
          }
        }
      }),
      db.instanciaSala.findMany({
        where: {
          requiereAsistenciaTecnica: true,
          inicioProgramadoAt: { gte: now },
          estado: "PROGRAMADA",
          asignaciones: { none: { estado: { in: ["ASIGNADO", "ACEPTADO"] } } }
        },
        orderBy: { inicioProgramadoAt: "asc" },
        take: 3,
        select: {
          id: true,
          inicioProgramadoAt: true,
          solicitud: { select: { id: true, titulo: true } },
          postulaciones: {
            where: {
              estado: "ME_INTERESA",
              asistenteTecnico: { cesadoHastaProximoInicioSesion: false }
            },
            include: {
              asistenteTecnico: {
                select: {
                  id: true,
                  usuario: { select: { nombres: true, apellidos: true } }
                }
              }
            },
            take: 1
          }
        }
      }),
      db.eventoProveedor.findMany({
        where: {
          proveedor: { tipo: "GOOGLE_MEET" },
          estadoIntegracion: "ERROR",
          instancia: { inicioProgramadoAt: { gte: now }, estado: "PROGRAMADA" }
        },
        orderBy: { instancia: { inicioProgramadoAt: "asc" } },
        take: 3,
        select: {
          id: true,
          errorIntegracion: true,
          operacionPendiente: true,
          instancia: {
            select: {
              inicioProgramadoAt: true,
              solicitud: { select: { id: true, titulo: true } }
            }
          }
        }
      }),
      db.eventoProveedor.findMany({
        where: {
          proveedor: { tipo: "GOOGLE_MEET" },
          estadoIntegracion: "SINCRONIZADA",
          archivosSincronizadosAt: null,
          instancia: {
            requiereGrabacion: true,
            finProgramadoAt: { gte: recordingLookback, lt: now },
            estado: { notIn: ["CANCELADA", "NO_REALIZADA"] }
          }
        },
        orderBy: { instancia: { inicioProgramadoAt: "desc" } },
        take: 3,
        select: {
          instancia: {
            select: {
              inicioProgramadoAt: true,
              solicitud: { select: { id: true, titulo: true } }
            }
          }
        }
      }),
      db.incidencia.findMany({
        where: { estado: { in: ["ABIERTA", "EN_ANALISIS"] } },
        orderBy: [{ severidad: "desc" }, { createdAt: "asc" }],
        take: 3,
        select: {
          tipo: true,
          severidad: true,
          descripcion: true,
          instancia: { select: { solicitud: { select: { id: true, titulo: true } } } }
        }
      }),
      listarCasosRevisionDuplicados(db, now),
      db.asistenteTecnico.findMany({
        where: {
          cesadoHastaProximoInicioSesion: false,
          usuario: { activo: true, rol: "ASISTENTE_TECNICO" }
        },
        orderBy: [{ usuario: { nombres: "asc" } }, { usuario: { apellidos: "asc" } }],
        select: {
          id: true,
          usuario: { select: { nombres: true, apellidos: true } }
        }
      })
    ]);
  const duplicateRisks = duplicateCases.filter(({ decision }) => decision !== "FALSO_POSITIVO");

  const formattedAssistants = activeAssistants.map((ast) => ({
    id: ast.id,
    name: [ast.usuario.nombres, ast.usuario.apellidos].filter(Boolean).join(" ")
  }));

  const firstUncoveredMeeting = pendingCoverageExamples[0];
  const firstApplicantAst = firstUncoveredMeeting?.postulaciones[0]?.asistenteTecnico;
  const firstApplicant = firstApplicantAst
    ? {
        id: firstApplicantAst.id,
        name: [firstApplicantAst.usuario.nombres, firstApplicantAst.usuario.apellidos].filter(Boolean).join(" ")
      }
    : null;

  const metrics = [
    { label: "Solicitudes abiertas", value: openRequests, copy: "En registro o provisión", icon: ClipboardList, tone: "neutral" },
    { label: "Reuniones de hoy", value: todayMeetings, copy: "Programadas para hoy", icon: CalendarClock, tone: "brand" },
    { label: "Próximos 7 días", value: weekMeetings, copy: "Carga operativa semanal", icon: CalendarDays, tone: "brand" },
    { label: "Sin asistencia técnica", value: pendingAssistance, copy: "Necesitan cobertura", icon: UserRoundCheck, tone: pendingAssistance ? "warning" : "ok" },
    { label: "Errores de Meet", value: integrationErrors, copy: "Requieren intervención", icon: CircleAlert, tone: integrationErrors ? "danger" : "ok" }
  ] as const;
  const hasPendingMeet = upcoming.some((meeting) =>
    meeting.eventosProveedor.some(({ proveedor, estadoIntegracion }) =>
      proveedor.tipo === "GOOGLE_MEET" && estadoIntegracion === "PENDIENTE"
    )
  );
  const attentionGroups = [
    pendingAssistance ? {
      key: "coverage",
      tone: "warning",
      icon: UserRoundCheck,
      count: pendingAssistance,
      title: "Reuniones sin asistencia técnica",
      detail: pendingCoverageExamples.map(({ solicitud, inicioProgramadoAt }) => `${solicitud.titulo} · ${formatDate(inicioProgramadoAt)} ${formatTime(inicioProgramadoAt)}`),
      href: "/asistencia-tecnica?estado=pendientes",
      action: "Asignar asistencia técnica",
      actionComponent: firstUncoveredMeeting ? (
        <AdminQuickAssignAction
          assistants={formattedAssistants}
          firstApplicant={firstApplicant}
          meetingId={firstUncoveredMeeting.id}
        />
      ) : null
    } : null,
    integrationErrors ? {
      key: "meet-errors",
      tone: "danger",
      icon: CircleAlert,
      count: integrationErrors,
      title: "Errores de Google Meet",
      detail: integrationErrorExamples.map(({ instancia, errorIntegracion }) => `${instancia.solicitud.titulo} · ${errorIntegracion ?? "Error sin detalle"}`),
      href: "/configuracion",
      action: "Resolver integración",
      actionComponent: <AdminRetryMeetAction />
    } : null,
    duplicateRisks.length ? {
      key: "duplicates",
      tone: "danger",
      icon: GitCompareArrows,
      count: duplicateRisks.length,
      title: "Posibles reuniones duplicadas",
      detail: duplicateRisks.slice(0, 3).map(({ izquierda, derecha }) => `${izquierda.titulo} / ${derecha.titulo}`),
      href: "/reuniones/duplicados",
      action: "Comparar reuniones",
      actionComponent: null
    } : null,
    pendingRecordingCount ? {
      key: "recordings",
      tone: "neutral",
      icon: Files,
      count: pendingRecordingCount,
      title: "Grabaciones pendientes de sincronización",
      detail: pendingRecordingExamples.map(({ instancia }) => `${instancia.solicitud.titulo} · ${formatDate(instancia.inicioProgramadoAt)}`),
      href: "/grabaciones",
      action: "Sincronizar archivos",
      actionComponent: <AdminSyncRecordingsAction />
    } : null,
    openIncidentCount ? {
      key: "incidents",
      tone: "danger",
      icon: Siren,
      count: openIncidentCount,
      title: "Incidencias abiertas",
      detail: openIncidents.map(({ instancia, descripcion }) => `${instancia.solicitud.titulo} · ${descripcion}`),
      href: `/reuniones/${openIncidents[0].instancia.solicitud.id}`,
      action: "Revisar incidencias",
      actionComponent: null
    } : null
  ].filter((group): group is NonNullable<typeof group> => group !== null);

  return (
    <div className="role-dashboard admin-dashboard">
      <header className="role-dashboard-hero admin-dashboard-hero">
        <div>
          <p className="page-eyebrow">{formatShortDate(now)}</p>
          <h1>Resumen operativo</h1>
          <p>Lo próximo y lo que requiere atención de Administración.</p>
        </div>
        <div className="role-dashboard-actions">
          <Link className="secondary-action" href="/asistencia-tecnica">Gestionar asistencia</Link>
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

      <section className="content-section operations-attention" aria-labelledby="operations-attention-title">
        <div className="section-heading">
          <div>
            <h2 id="operations-attention-title">Requiere atención</h2>
            <p>Excepciones operativas ordenadas para resolver sin recorrer todo el sistema.</p>
          </div>
          {attentionGroups.length ? <span className="operations-attention-total">{attentionGroups.reduce((total, group) => total + group.count, 0)}</span> : <CheckCircle2 size={24} color="var(--ok)" />}
        </div>
        {attentionGroups.length ? (
          <div className="operations-attention-grid">
            {attentionGroups.map(({ key, tone, icon: Icon, count, title, detail, href, action, actionComponent }) => (
              <article className={`operations-attention-card tone-${tone}`} key={key}>
                <div className="operations-attention-card-heading">
                  <span><Icon size={18} /></span>
                  <div><strong>{title}</strong><small>{count} {count === 1 ? "caso" : "casos"}</small></div>
                </div>
                <ul>{detail.map((item, index) => <li key={`${key}-${index}`}>{item}</li>)}</ul>
                {actionComponent}
                <Link className="text-link" href={href}>{action}<ArrowRight size={15} /></Link>
              </article>
            ))}
          </div>
        ) : (
          <div className="operations-all-clear"><CheckCircle2 size={23} /><div><strong>Todo bajo control</strong><p>No hay excepciones operativas que requieran intervención inmediata.</p></div></div>
        )}
      </section>

      <section className="content-section admin-upcoming-section admin-upcoming-v2">
        <div className="section-heading admin-upcoming-heading">
          <div>
            <h2>Próximas reuniones</h2>
            <p>Accesos, cohosts y responsables en una vista operativa.</p>
          </div>
          <Link className="text-link" href="/reuniones">Ver agenda <ArrowRight size={16} /></Link>
        </div>

        <div className="admin-upcoming-guidance" role="note">
          <strong>Acceso a Google Meet</strong>
          <span>
            Los cohosts ingresan con su cuenta Google o FLACSO configurada. La cuenta organizadora se muestra
            únicamente como referencia y no debe usarse para iniciar sesión.
          </span>
        </div>

        {hasPendingMeet ? <MeetPendingNotice /> : null}

        {upcoming.length === 0 ? (
          <div className="empty-state"><CalendarDays size={24} /><p>No hay reuniones próximas.</p></div>
        ) : (
          <div className="admin-upcoming-list">
            {upcoming.map((meeting) => {
              const association = meeting.solicitud.docentePrograma;
              const teacher = association.docente.usuario;
              const assignment = meeting.asignaciones[0];
              const assistant = assignment?.asistenteTecnico.usuario;
              const meet = meeting.eventosProveedor.find(({ proveedor }) => proveedor.tipo === "GOOGLE_MEET");
              const responsible = meeting.solicitud.responsableNombre?.trim() ||
                `${teacher.nombres} ${teacher.apellidos ?? ""}`.trim();
              const cohosts = [
                ...meeting.cohosts.map(({ cuentaGoogle }) => ({
                  email: cuentaGoogle.email,
                  name: [cuentaGoogle.user.nombres, cuentaGoogle.user.apellidos]
                    .filter(Boolean)
                    .join(" ")
                })),
                ...meeting.cohostEmails.map(({ email }) => ({ email, name: "" }))
              ].filter((entry, index, entries) =>
                entries.findIndex(
                  (candidate) => candidate.email.toLowerCase() === entry.email.toLowerCase()
                ) === index
              );
              const cohostEmails = [
                ...meeting.cohosts.map(({ cuentaGoogle }) => cuentaGoogle.email),
                ...meeting.cohostEmails.map(({ email }) => email)
              ];
              const cohostsConfirmadosEnMeet = Boolean(
                !meet?.errorIntegracion &&
                !meet?.operacionPendiente &&
                cohostsConfirmados(
                  meet?.payloadUltimo,
                  meet?.codigoReunion,
                  meet?.cuentaProveedor?.emailOrganizador,
                  cohostEmails
                )
              );
              const guidance = cohostAccountGuidance(cohostEmails);
              const organizer =
                meet?.cuentaProveedor?.emailOrganizador ??
                meet?.cuentaProveedor?.nombre ??
                "Pendiente";

              return (
                <article className="admin-upcoming-card" key={meeting.id}>
                  <div className="admin-upcoming-when">
                    <span className="admin-upcoming-calendar-icon"><CalendarDays size={19} /></span>
                    <span>{formatDate(meeting.inicioProgramadoAt)}</span>
                    <strong>{formatTime(meeting.inicioProgramadoAt)}</strong>
                  </div>

                  <div className="admin-upcoming-main">
                    <Link
                      className="admin-upcoming-title"
                      href={`/reuniones/${meeting.solicitud.id}`}
                    >
                      {meeting.solicitud.titulo}
                    </Link>
                    <span className="admin-upcoming-modality">
                      {meeting.solicitud.modalidad === "HIBRIDA" ? "Híbrida" : "Virtual"}
                    </span>
                  </div>

                  <div className="admin-upcoming-academic">
                    <div>
                      <small>Docente</small>
                      <Link
                        className="teacher-meetings-link"
                        href={`/docentes/${teacher.id}/reuniones`}
                      >
                        {teacher.nombres} {teacher.apellidos}
                      </Link>
                    </div>
                    <div>
                      <small>Programa</small>
                      <strong>{association.programa.nombre}</strong>
                    </div>
                  </div>

                  <div className="admin-upcoming-access">
                    <div
                      className={`admin-upcoming-cohosts ${
                        cohosts.length === 0
                          ? "is-missing"
                          : cohostsConfirmadosEnMeet
                            ? "is-verified"
                            : "is-unverified"
                      }`}
                    >
                      <div className="admin-upcoming-cohost-header">
                        <small>
                          Cohost{cohosts.length === 1 ? "" : "s"}
                          {cohosts.length ? ` · ${guidance}` : ""}
                        </small>
                        {cohosts.length ? (
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
                      {cohosts.length ? (
                        <div className="admin-upcoming-cohost-list">
                          {cohosts.slice(0, 2).map((cohost) => (
                            <div className="admin-upcoming-cohost" key={cohost.email.toLowerCase()}>
                              <strong>{cohost.name || cohost.email}</strong>
                              {cohost.name ? <span>{cohost.email}</span> : null}
                            </div>
                          ))}
                          {cohosts.length > 2 ? (
                            <span className="admin-upcoming-more-cohosts">+{cohosts.length - 2} más</span>
                          ) : null}
                        </div>
                      ) : (
                        <strong>Sin cohost configurado</strong>
                      )}
                    </div>

                    <div className="admin-upcoming-meet-actions">
                      <MeetIntegrationStatus
                        status={meet?.estadoIntegracion}
                        hasMeet={Boolean(meet?.joinUrl)}
                      />
                      {meet?.joinUrl ? (
                        <CopyMeetLinkButton url={meet.joinUrl} />
                      ) : (
                        <span className="muted-text">Link pendiente</span>
                      )}
                      {!cohostsConfirmadosEnMeet && cohosts.length > 0 && meet?.id && meet.joinUrl ? (
                        <AdminRetryMeetAction
                          eventoProveedorId={meet.id}
                          operacion="CONFIGURAR_MEET"
                          label="Verificar cohosts"
                        />
                      ) : null}
                    </div>

                    <div className="admin-upcoming-organizer">
                      <small>Cuenta organizadora · solo referencia</small>
                      <strong>{organizer}</strong>
                      <span>No iniciar sesión con esta cuenta.</span>
                    </div>
                  </div>

                  <div className="admin-upcoming-operations">
                    <div>
                      <small>Asistencia técnica</small>
                      {assistant ? (
                        <>
                          <span className="status status-ok">Asignada</span>
                          <strong>{assistant.nombres} {assistant.apellidos}</strong>
                          {cohostsConfirmadosEnMeet ? (
                            <em>Cohost técnico verificado</em>
                          ) : (
                            <em className="text-warning">Permisos Meet pendientes</em>
                          )}
                        </>
                      ) : meeting.requiereAsistenciaTecnica ? (
                        <span className="status status-warning">
                          <AlertTriangle size={14} />Pendiente
                        </span>
                      ) : (
                        <span className="admin-upcoming-neutral-status">No requiere</span>
                      )}
                    </div>

                    <div>
                      <small>A cargo / Responsable</small>
                      <strong>{responsible}</strong>
                    </div>
                  </div>
                </article>
              );
            })}
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
