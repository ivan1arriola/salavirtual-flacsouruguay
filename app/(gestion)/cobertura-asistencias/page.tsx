import { ArrowRight, CalendarClock, Search, UserRoundCheck, UsersRound } from "lucide-react";
import Link from "next/link";
import { redirect } from "next/navigation";
import { auth } from "@/auth";
import { AssistantAssignmentSelect } from "@/src/components/assistant-assignment-select";
import { CoverageAssistanceActions } from "@/src/components/coverage-assistance-actions";
import { MeetLinkActions } from "@/src/components/copy-meet-link-button";
import { resolveSessionActor } from "@/src/lib/auth/session-actor.adapter";
import { db } from "@/src/lib/db";
import { formatDate, formatTime } from "@/src/lib/ui/format";
import { buildAssignmentSuggestions } from "@/src/modules/asistencia/asignacion-sugerencias.service";

const ACTIVE_ASSIGNMENTS = ["ASIGNADO", "ACEPTADO"] as const;

export default async function CoberturaAsistenciasPage({
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
      startsAt: assignment.instancia.inicioProgramadoAt,
      endsAt: assignment.instancia.finProgramadoAt,
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
          <p className="page-eyebrow">Asistencia técnica</p>
          <h1>Cobertura de asistencias técnicas</h1>
          <p>Instancias futuras que requieren asistencia técnica, cubiertas y pendientes.</p>
        </div>
        <UserRoundCheck size={28} color="var(--brand)" aria-hidden="true" />
      </header>

      <section className="metric-grid coverage-stats" aria-label="Resumen de cobertura">
        <div className="stat"><span>Total futuro</span><strong>{total}</strong></div>
        <div className="stat"><span>Cubiertas</span><strong>{covered}</strong></div>
        <div className="stat"><span>Pendientes</span><strong>{pending}</strong></div>
      </section>

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

      <section className="coverage-results" aria-label="Reuniones que requieren asistencia técnica">
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
                  const applicants = meeting.postulaciones.map((interest) => ({
                    id: interest.asistenteTecnico.id,
                    name: [interest.asistenteTecnico.usuario.nombres, interest.asistenteTecnico.usuario.apellidos].filter(Boolean).join(" ")
                  }));
                  return (
                    <article className={`coverage-card ${covered ? "is-covered" : "is-pending"}`} key={meeting.id}>
                      <header className="coverage-card-header">
                        <div className="coverage-date">
                          <CalendarClock size={18} />
                          <span><strong>{formatDate(meeting.inicioProgramadoAt)}</strong><small>{formatTime(meeting.inicioProgramadoAt)} h</small></span>
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
                            <span><strong>Modalidad</strong>{meeting.solicitud.modalidad === "HIBRIDA" ? "Híbrida" : "Virtual"}</span>
                            <span><strong>Sala Meet</strong>{meet?.cuentaProveedor?.nombre ?? "Sin sala asignada"}</span>
                          </div>
                          <div className="coverage-interest-summary">
                            <UsersRound size={17} />
                            <strong>{applicants.length}</strong> {applicants.length === 1 ? "persona postulada" : "personas postuladas"}
                          </div>
                        </div>

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
                      </div>

                      <footer className="coverage-card-footer">
                        <div className="coverage-quick-links">
                          <Link className="text-link" href={`/reuniones/${meeting.solicitud.id}`}>Ver reunión <ArrowRight size={15} /></Link>
                          {meet?.joinUrl ? (
                            <MeetLinkActions url={meet.joinUrl} />
                          ) : <span className="muted-text">Meet pendiente</span>}
                        </div>
                        <CoverageAssistanceActions
                          covered={covered}
                          meetingId={meeting.id}
                          requestId={meeting.solicitud.id}
                        />
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
