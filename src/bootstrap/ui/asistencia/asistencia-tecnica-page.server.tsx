import { ArrowRight, CalendarClock, Search, UserRoundCheck, UsersRound } from "lucide-react";
import Link from "next/link";
import { redirect } from "next/navigation";
import { auth } from "@/auth";
import { AssistantAssignmentSelect } from "@/src/modules/asistencia/presentation/components/assistant-assignment-select";
import { BulkMonitoringNotificationActions } from "@/src/modules/asistencia/presentation/components/bulk-monitoring-notification-actions";
import { CoverageAssistanceActions } from "@/src/modules/asistencia/presentation/components/coverage-assistance-actions";
import { MeetLinkActions } from "@/src/components/copy-meet-link-button";
import { resolveSessionActor } from "@/src/lib/auth/session-actor.adapter";
import { db } from "@/src/lib/db";
import { formatDate, formatTime } from "@/src/lib/ui/format";
import { buildAssignmentSuggestions } from "@/src/modules/asistencia/asignacion-sugerencias.service";

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
  const [meetings, assistants, futureAssignments] = await Promise.all([
    db.instanciaSala.findMany({
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
    }),
    db.asistenteTecnico.findMany({
      where: {
        disponibleGeneral: true,
        cesadoHastaProximoInicioSesion: false,
        usuario: { activo: true, rol: "ASISTENTE_TECNICO" }
      },
      orderBy: [{ usuario: { nombres: "asc" } }, { usuario: { apellidos: "asc" } }],
      select: {
        id: true,
        cesadoHastaProximoInicioSesion: true,
        usuario: { select: { nombres: true, apellidos: true } },
        disponibilidades: true
      }
    }),
    db.asignacionAsistenciaTecnica.findMany({
      where: {
        estado: { in: [...ACTIVE_ASSIGNMENTS] },
        instancia: {
          estado: "PROGRAMADA",
          finProgramadoAt: { gte: now }
        }
      },
      select: {
        asistenteTecnicoId: true,
        instancia: {
          select: {
            id: true,
            inicioProgramadoAt: true,
            finProgramadoAt: true,
            inicioAsistenciaTecnicaAt: true,
            finAsistenciaTecnicaAt: true,
            timezone: true
          }
        }
      }
    })
  ]);

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

  const assistantOptions = assistants.map((assistant) => ({
    id: assistant.id,
    name: [assistant.usuario.nombres, assistant.usuario.apellidos].filter(Boolean).join(" "),
    cesadoHastaProximoInicioSesion: assistant.cesadoHastaProximoInicioSesion,
    disponibilidades: assistant.disponibilidades
  }));
  const suggestions = buildAssignmentSuggestions({
    meetings: rows.map(({ meeting, covered }) => ({ meeting, covered })),
    assistants: assistantOptions,
    assignments: futureAssignments.map((assignment) => ({
      assistantId: assignment.asistenteTecnicoId,
      meetingId: assignment.instancia.id,
      startsAt: assignment.instancia.inicioAsistenciaTecnicaAt ?? assignment.instancia.inicioProgramadoAt,
      endsAt: assignment.instancia.finAsistenciaTecnicaAt ?? assignment.instancia.finProgramadoAt,
      timezone: assignment.instancia.timezone
    }))
  });
  const total = meetings.length;
  const covered = meetings.filter(({ asignaciones }) => asignaciones.length > 0).length;
  const pending = total - covered;

  return (
    <>
      <header className="page-header">
        <div>
          <p className="page-eyebrow">Monitoreo</p>
          <h1>Gestión de monitoreo</h1>
          <p>Asigná asistentes y controlá las reuniones que todavía necesitan apoyo.</p>
        </div>
        <UserRoundCheck size={28} color="var(--brand)" aria-hidden="true" />
      </header>

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
            {rows.map(({ meeting, assignment, covered }) => {
                  const association = meeting.solicitud.docentePrograma;
                  const meet = meeting.eventosProveedor.find(({ proveedor }) => proveedor.tipo === "GOOGLE_MEET");
                  const assistantName = assignment
                    ? [assignment.asistenteTecnico.usuario.nombres, assignment.asistenteTecnico.usuario.apellidos].filter(Boolean).join(" ")
                    : null;
                  const modalidad = meeting.modalidadOverride ?? meeting.solicitud.modalidad;
                  const inicioAsistencia = meeting.inicioAsistenciaTecnicaAt ?? meeting.inicioProgramadoAt;
                  const finAsistencia = meeting.finAsistenciaTecnicaAt ?? meeting.finProgramadoAt;
                  const applicants = meeting.postulaciones.map((interest) => ({
                    id: interest.asistenteTecnico.id,
                    name: [interest.asistenteTecnico.usuario.nombres, interest.asistenteTecnico.usuario.apellidos].filter(Boolean).join(" ")
                  }));
                  return (
                    <article className={`coverage-card ${covered ? "is-covered" : "is-pending"}`} key={meeting.id}>
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
                          <p className="coverage-card-eyebrow">{association.programa.nombre}</p>
                          <Link className="coverage-title-link" href={`/reuniones/${meeting.solicitud.id}`}>{meeting.solicitud.titulo}</Link>
                          <div className="coverage-meeting-meta">
                            <span><strong>Docente</strong>{association.docente.usuario.nombres} {association.docente.usuario.apellidos}</span>
                            <span><strong>Modalidad</strong>{modalidad === "HIBRIDA" ? "Híbrida" : "Virtual"}</span>
                            {modalidad === "HIBRIDA" ? (
                              <span><strong>Meet</strong>{formatTime(meeting.inicioProgramadoAt)}–{formatTime(meeting.finProgramadoAt)}</span>
                            ) : null}
                            <span><strong>Cuenta Google</strong>{meet?.cuentaProveedor?.emailOrganizador ?? meet?.cuentaProveedor?.nombre ?? "Sin cuenta asignada"}</span>
                          </div>
                          <div className="coverage-interest-summary">
                            <UsersRound size={17} />
                            <strong>{applicants.length}</strong> {applicants.length === 1 ? "persona postulada" : "personas postuladas"}
                          </div>
                        </div>

                      </div>

                      <footer className="coverage-card-footer">
                        <div className="coverage-quick-links">
                          {meet?.joinUrl ? (
                            <MeetLinkActions url={meet.joinUrl} />
                          ) : <span className="muted-text">Meet pendiente</span>}
                          <Link className="text-link" href={`/reuniones/${meeting.solicitud.id}`}>Ver detalle <ArrowRight size={15} /></Link>
                        </div>
                        <details className="coverage-management-disclosure">
                          <summary>
                            <span>{assistantName ? `Asignada a ${assistantName}` : "Asignar cobertura"}</span>
                            <span>Gestionar</span>
                          </summary>
                          <div className="coverage-management-content">
                        <aside className="coverage-assignment-panel">
                          <div className="coverage-assignment-heading">
                            <span>{covered ? "Persona a cargo" : "Asignar cobertura"}</span>
                            {assistantName ? <strong>{assistantName}</strong> : <small>Todavía no hay una persona asignada.</small>}
                          </div>
                        <AssistantAssignmentSelect
                          assistants={assistantOptions}
                          applicants={applicants}
                          currentAssistantId={assignment?.asistenteTecnicoId}
                          meetingId={meeting.id}
                          suggestedAssistant={suggestions.get(meeting.id) ?? null}
                        />
                        </aside>
                            <CoverageAssistanceActions
                          covered={covered}
                          assignmentId={assignment?.id ?? null}
                          assistantName={assistantName}
                          meetingId={meeting.id}
                          requestId={meeting.solicitud.id}
                        />
                          </div>
                        </details>
                      </footer>
                    </article>
                  );
                })}
          </div>
        )}
      </section>
    </>
  );
}
