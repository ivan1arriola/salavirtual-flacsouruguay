import { AlertTriangle, CheckCircle2, Clock3, Hand } from "lucide-react";
import { redirect } from "next/navigation";
import { auth } from "@/auth";
import {
  AssistantAssignmentSelect,
  type ApplicantOption
} from "@/src/modules/asistencia/presentation/components/assistant-assignment-select";
import { AssistantInterestButton } from "@/src/modules/asistencia/presentation/components/assistant-interest-button";
import { resolveSessionActor } from "@/src/lib/auth/session-actor.adapter";
import { db } from "@/src/lib/db";
import { formatMinutes } from "@/src/lib/ui/assistant-format";
import { MeetingScheduleTimes } from "@/src/components/meeting-schedule-times";
import { formatDateTime, formatTime } from "@/src/lib/ui/format";
import {
  agruparPorFecha,
  evaluarConflictoAsistencia,
  ordenarPostulantesParaAdministracion,
  type AsignacionExistente
} from "@/src/modules/asistencia/agenda-abierta.domain";
import { obtenerAsistenciasPersonales } from "@/src/modules/asistencia/resumen-personal.adapter";
import { resumirAsistencias } from "@/src/modules/asistencia/resumen-personal.domain";

const ACTIVE_ASSIGNMENTS = ["ASIGNADO", "ACEPTADO"] as const;

export default async function AgendaAbiertaPage() {
  const session = await auth();
  if (!session?.user) redirect("/acceso");
  const actor = await resolveSessionActor(db, {
    id: session.user.id,
    email: session.user.email
  });
  if (!actor?.activo || !["ASISTENTE_TECNICO", "ADMINISTRACION"].includes(actor.rol)) {
    redirect("/reuniones");
  }
  const assistant = actor.rol === "ASISTENTE_TECNICO"
    ? await db.asistenteTecnico.findUnique({ where: { usuarioId: actor.id }, select: { id: true } })
    : null;
  if (actor.rol === "ASISTENTE_TECNICO" && !assistant) redirect("/");

  const ahora = new Date();
  const meetings = await db.instanciaSala.findMany({
    where: {
      requiereAsistenciaTecnica: true,
      finProgramadoAt: { gte: ahora },
      estado: "PROGRAMADA",
      asignaciones: { none: { estado: { in: [...ACTIVE_ASSIGNMENTS] } } }
    },
    orderBy: { inicioProgramadoAt: "asc" },
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
  });
  const meetingIds = meetings.map(({ id }) => id);

  const [assistantAssignments, personalMonth, interests, assistantOptions] = await Promise.all([
    actor.rol === "ASISTENTE_TECNICO" && assistant
      ? db.asignacionAsistenciaTecnica.findMany({
          where: {
            asistenteTecnicoId: assistant.id,
            estado: { in: [...ACTIVE_ASSIGNMENTS] },
            instancia: {
              finProgramadoAt: { gte: ahora },
              estado: "PROGRAMADA"
            }
          },
          select: {
            instancia: {
              select: {
                id: true,
                inicioProgramadoAt: true,
                finProgramadoAt: true,
                inicioAsistenciaTecnicaAt: true,
                finAsistenciaTecnicaAt: true,
                solicitud: { select: { titulo: true } }
              }
            }
          }
        })
      : Promise.resolve([]),
    actor.rol === "ASISTENTE_TECNICO"
      ? obtenerAsistenciasPersonales(db, actor.id, "MES_ACTUAL", ahora)
      : Promise.resolve([]),
    actor.rol === "ASISTENTE_TECNICO"
      ? db.postulacionAsistenciaTecnica.findMany({
          where: { instanciaSalaId: { in: meetingIds }, asistenteTecnicoId: assistant?.id },
          select: { instanciaSalaId: true, estado: true }
        })
      : db.postulacionAsistenciaTecnica.findMany({
          where: {
            instanciaSalaId: { in: meetingIds },
            estado: "ME_INTERESA",
            asistenteTecnico: { cesadoHastaProximoInicioSesion: false }
          },
          select: {
            instanciaSalaId: true,
            asistenteTecnico: {
              select: {
                id: true,
                usuario: { select: { nombres: true, apellidos: true } },
                asignaciones: {
                  where: {
                    estado: { in: [...ACTIVE_ASSIGNMENTS] },
                    instancia: { estado: "PROGRAMADA" }
                  },
                  select: {
                    instancia: {
                      select: {
                        id: true,
                        inicioProgramadoAt: true,
                        finProgramadoAt: true,
                        inicioAsistenciaTecnicaAt: true,
                        finAsistenciaTecnicaAt: true,
                        solicitud: { select: { titulo: true } }
                      }
                    }
                  }
                }
              }
            }
          },
          orderBy: { createdAt: "asc" }
        }),
    actor.rol === "ADMINISTRACION"
      ? db.asistenteTecnico.findMany({
          where: {
            cesadoHastaProximoInicioSesion: false,
            usuario: { activo: true, rol: "ASISTENTE_TECNICO" }
          },
          orderBy: [{ usuario: { nombres: "asc" } }, { usuario: { apellidos: "asc" } }],
          select: { id: true, usuario: { select: { nombres: true, apellidos: true } } }
        })
      : Promise.resolve([])
  ]);

  const monthSummary = resumirAsistencias(personalMonth);
  const currentMonthMinutes = monthSummary.minutosVirtuales + monthSummary.minutosHibridos;
  const activeApplicationsCount = actor.rol === "ASISTENTE_TECNICO"
    ? interests.filter((i) => "estado" in i && i.estado === "ME_INTERESA").length
    : 0;

  const assignedList: AsignacionExistente[] = assistantAssignments.map(({ instancia }) => ({
    id: instancia.id,
    titulo: instancia.solicitud.titulo,
    inicio: instancia.inicioAsistenciaTecnicaAt ?? instancia.inicioProgramadoAt,
    fin: instancia.finAsistenciaTecnicaAt ?? instancia.finProgramadoAt
  }));

  const assignableAssistants = assistantOptions.map((item) => ({
    id: item.id,
    name: [item.usuario.nombres, item.usuario.apellidos].filter(Boolean).join(" ")
  }));

  const dayGroups = agruparPorFecha(meetings, ahora, "America/Montevideo");

  return (
    <>
      <header className="page-header">
        <div>
          <p className="page-eyebrow">Asistencia técnica</p>
          <h1>Agenda abierta</h1>
          <p>{meetings.length} reuniones sin asistente técnico asignado.</p>
        </div>
        <Hand size={28} color="var(--brand)" aria-hidden="true" />
      </header>

      {actor.rol === "ASISTENTE_TECNICO" ? (
        <section className="open-agenda-summary-bar" aria-label="Resumen de disponibilidad">
          <div className="open-agenda-summary-item">
            <Clock3 size={18} aria-hidden="true" />
            <span>Horas asignadas este mes: <strong>{formatMinutes(currentMonthMinutes)}</strong></span>
          </div>
          <div className="open-agenda-summary-item">
            <Hand size={18} aria-hidden="true" />
            <span>Reuniones abiertas: <strong>{meetings.length}</strong></span>
          </div>
          <div className="open-agenda-summary-item">
            <CheckCircle2 size={18} aria-hidden="true" />
            <span>Tus postulaciones: <strong>{activeApplicationsCount}</strong></span>
          </div>
        </section>
      ) : null}

      <section
        className="content-section"
        data-tour={actor.rol === "ASISTENTE_TECNICO" ? "assistant-open-list" : undefined}
      >
        {meetings.length === 0 ? (
          <div className="empty-state">
            <Hand size={24} aria-hidden="true" />
            <p>No hay reuniones abiertas para postulación.</p>
          </div>
        ) : actor.rol === "ASISTENTE_TECNICO" ? (
          <div className="open-agenda-days-container">
            {dayGroups.map((group) => (
              <section className="open-agenda-day-group" key={group.claveFecha}>
                <div className="open-agenda-day-header">
                  <h2>{group.etiquetaFecha}</h2>
                  <span
                    className={`open-agenda-relative-pill${
                      group.etiquetaRelativa === "Hoy"
                        ? " is-today"
                        : group.etiquetaRelativa === "Mañana"
                          ? " is-tomorrow"
                          : ""
                    }`}
                  >
                    {group.etiquetaRelativa}
                  </span>
                </div>

                <div className="open-agenda-card-grid">
                  {group.items.map((meeting) => {
                    const association = meeting.solicitud.docentePrograma;
                    const teacher = association.docente.usuario;
                    const meet = meeting.eventosProveedor.find(({ proveedor }) => proveedor.tipo === "GOOGLE_MEET");
                    const interest = interests.find((item) => item.instanciaSalaId === meeting.id);
                    const interested = interest && "estado" in interest && interest.estado === "ME_INTERESA";
                    const modalidad = meeting.modalidadOverride ?? meeting.solicitud.modalidad;
                    const inicioAsistencia = meeting.inicioAsistenciaTecnicaAt ?? meeting.inicioProgramadoAt;
                    const finAsistencia = meeting.finAsistenciaTecnicaAt ?? meeting.finProgramadoAt;
                    const missingHybridSchedule = modalidad === "HIBRIDA" &&
                      (!meeting.inicioAsistenciaTecnicaAt || !meeting.finAsistenciaTecnicaAt);
                    const durationMin = Math.max(
                      1,
                      Math.round((finAsistencia.getTime() - inicioAsistencia.getTime()) / 60_000)
                    );
                    const conflict = evaluarConflictoAsistencia(
                      { inicio: inicioAsistencia, fin: finAsistencia },
                      assignedList
                    );
                    const cardStateClass = conflict.estado === "CONFLICTO"
                      ? " has-conflict"
                      : conflict.estado === "MUY_PROXIMO"
                        ? " has-warning"
                        : " is-available";

                    return (
                      <article className={`open-agenda-card${cardStateClass}`} key={meeting.id}>
                        <div className="open-agenda-card-meta">
                          <span className="time-tag">
                            Cobertura: {formatTime(inicioAsistencia)}–{formatTime(finAsistencia)} ({formatMinutes(durationMin)})
                          </span>
                          <span className={`mode-pill mode-${modalidad.toLowerCase()}`}>
                            {modalidad === "HIBRIDA" ? "Híbrida" : "Virtual"}
                          </span>
                        </div>

                        <div className="open-agenda-card-body">
                          <span className="open-agenda-card-program">{association.programa.nombre}</span>
                          <h3 className="open-agenda-card-title">{meeting.solicitud.titulo}</h3>
                          <p className="open-agenda-card-teacher">Docente: {teacher.nombres} {teacher.apellidos}</p>
                          <MeetingScheduleTimes startsAt={meeting.inicioProgramadoAt} endsAt={meeting.finProgramadoAt} requiresAssistance assistanceStartsAt={inicioAsistencia} assistanceEndsAt={finAsistencia} viewerIsAssistant={actor.rol === "ASISTENTE_TECNICO"} compact />
                          {missingHybridSchedule ? <small className="status status-warning">Falta definir llegada y salida para esta cobertura híbrida</small> : null}
                          {meet?.cuentaProveedor?.emailOrganizador || meet?.cuentaProveedor?.nombre ? (
                            <small className="muted-text">
                              Cuenta: {meet.cuentaProveedor.emailOrganizador ?? meet.cuentaProveedor.nombre}
                            </small>
                          ) : null}
                        </div>

                        <div className="open-agenda-availability-box">
                          {conflict.estado === "DISPONIBLE" ? (
                            <div className="availability-tag tone-green">
                              <CheckCircle2 size={15} aria-hidden="true" />
                              <span>{conflict.etiqueta} (sin superposiciones)</span>
                            </div>
                          ) : conflict.estado === "MUY_PROXIMO" ? (
                            <>
                              <div className="availability-tag tone-amber">
                                <Clock3 size={15} aria-hidden="true" />
                                <span>{conflict.etiqueta}</span>
                              </div>
                              <small className="availability-detail">{conflict.detalle}</small>
                            </>
                          ) : (
                            <>
                              <div className="availability-tag tone-red">
                                <AlertTriangle size={15} aria-hidden="true" />
                                <span>{conflict.etiqueta}</span>
                              </div>
                              <small className="availability-detail">{conflict.detalle}</small>
                            </>
                          )}
                        </div>

                        <div className="open-agenda-card-actions">
                          <AssistantInterestButton
                            disabledReason={
                              missingHybridSchedule
                                ? "Administración debe definir la hora exacta de llegada y salida antes de abrir esta cobertura híbrida."
                                : conflict.estado === "CONFLICTO" ? conflict.detalle : undefined
                            }
                            interested={Boolean(interested)}
                            meetingId={meeting.id}
                          />
                        </div>
                      </article>
                    );
                  })}
                </div>
              </section>
            ))}
          </div>
        ) : (
          <div className="table-wrap">
            <table className="data-table">
              <thead>
                <tr>
                  <th>Fecha y hora (UTC-3)</th>
                  <th>Reunión</th>
                  <th>Programa</th>
                  <th>Sala</th>
                  <th>Postulantes ordenados por disponibilidad</th>
                </tr>
              </thead>
              <tbody>
                {meetings.map((meeting) => {
                  const association = meeting.solicitud.docentePrograma;
                  const meet = meeting.eventosProveedor.find(({ proveedor }) => proveedor.tipo === "GOOGLE_MEET");
                  const meetingApplicants = interests
                    .filter((item) => item.instanciaSalaId === meeting.id && "asistenteTecnico" in item)
                    .map((item) => {
                      if (!("asistenteTecnico" in item)) return null;
                      const ast = item.asistenteTecnico;
                      const candPeriod = {
                        inicio: meeting.inicioAsistenciaTecnicaAt ?? meeting.inicioProgramadoAt,
                        fin: meeting.finAsistenciaTecnicaAt ?? meeting.finProgramadoAt
                      };
                      const astAssignments: AsignacionExistente[] = ast.asignaciones.map(({ instancia }) => ({
                        id: instancia.id,
                        titulo: instancia.solicitud.titulo,
                        inicio: instancia.inicioAsistenciaTecnicaAt ?? instancia.inicioProgramadoAt,
                        fin: instancia.finAsistenciaTecnicaAt ?? instancia.finProgramadoAt
                      }));
                      const conf = evaluarConflictoAsistencia(candPeriod, astAssignments);
                      const meetingMonth = meeting.inicioProgramadoAt.getUTCMonth();
                      const meetingYear = meeting.inicioProgramadoAt.getUTCFullYear();
                      const monthlyMinutes = astAssignments
                        .filter((a) => a.inicio.getUTCMonth() === meetingMonth && a.inicio.getUTCFullYear() === meetingYear)
                        .reduce((acc, a) => acc + Math.round((a.fin.getTime() - a.inicio.getTime()) / 60_000), 0);

                      return {
                        id: ast.id,
                        name: [ast.usuario.nombres, ast.usuario.apellidos].filter(Boolean).join(" "),
                        estadoDisponibilidad: conf.estado,
                        etiquetaDisponibilidad: conf.etiqueta,
                        minutosMensuales: monthlyMinutes,
                        detalleConflicto: conf.estado !== "DISPONIBLE" ? conf.detalle : undefined
                      };
                    })
                    .filter((item): item is NonNullable<typeof item> => Boolean(item));

                  const sortedApplicants = ordenarPostulantesParaAdministracion(meetingApplicants);
                  const applicantOptions: ApplicantOption[] = sortedApplicants.map((a) => ({
                    id: a.id,
                    name: a.name,
                    status: a.estadoDisponibilidad,
                    monthlyMinutes: a.minutosMensuales,
                    conflictDetail: a.detalleConflicto
                  }));

                  return (
                    <tr key={meeting.id}>
                      <td className="date-cell">
                        {formatDateTime(meeting.inicioAsistenciaTecnicaAt ?? meeting.inicioProgramadoAt)}
                        {meeting.inicioAsistenciaTecnicaAt || meeting.finAsistenciaTecnicaAt ? (
                          <small>Meet {formatTime(meeting.inicioProgramadoAt)}–{formatTime(meeting.finProgramadoAt)}</small>
                        ) : null}
                      </td>
                      <td>
                        <strong>{meeting.solicitud.titulo}</strong>
                        <small>{association.docente.usuario.nombres} {association.docente.usuario.apellidos}</small>
                      </td>
                      <td>{association.programa.nombre}</td>
                      <td>{meet?.cuentaProveedor?.emailOrganizador ?? meet?.cuentaProveedor?.nombre ?? "Sin cuenta"}</td>
                      <td>
                        <AssistantAssignmentSelect
                          applicants={applicantOptions}
                          assistants={assignableAssistants}
                          meetingId={meeting.id}
                        />
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
