import { ExternalLink, Search, UserRoundCheck } from "lucide-react";
import Link from "next/link";
import { redirect } from "next/navigation";
import { auth } from "@/auth";
import { AssistantAssignmentSelect } from "@/src/components/assistant-assignment-select";
import { resolveSessionActor } from "@/src/lib/auth/session-actor.adapter";
import { db } from "@/src/lib/db";
import { formatDateTime } from "@/src/lib/ui/format";

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
        requiereAsistencia: true,
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
          include: { asistente: { include: { usuario: true } } },
          orderBy: { updatedAt: "desc" }
        },
        intereses: {
          where: { estado: "ME_INTERESA" },
          include: { asistente: { include: { usuario: true } } },
          orderBy: { createdAt: "asc" }
        },
        eventosProveedor: {
          include: { proveedor: true, cuentaProveedor: true }
        }
      }
    }),
    db.asistente.findMany({
      where: { usuario: { activo: true, rol: "ASISTENTE" } },
      orderBy: [{ usuario: { nombres: "asc" } }, { usuario: { apellidos: "asc" } }],
      select: {
        id: true,
        usuario: { select: { nombres: true, apellidos: true } }
      }
    }),
    db.asignacionAsistente.findMany({
      where: {
        estado: { in: [...ACTIVE_ASSIGNMENTS] },
        instancia: {
          estado: "PROGRAMADA",
          finProgramadoAt: { gte: now }
        }
      },
      select: {
        asistenteId: true,
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
    name: [assistant.usuario.nombres, assistant.usuario.apellidos].filter(Boolean).join(" ")
  }));
  const suggestions = buildAssignmentSuggestions({
    meetings: rows.map(({ meeting, covered }) => ({ meeting, covered })),
    assistants: assistantOptions,
    assignments: futureAssignments.map((assignment) => ({
      assistantId: assignment.asistenteId,
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
          <p className="page-eyebrow">Asistencia</p>
          <h1>Cobertura de asistencias</h1>
          <p>Instancias futuras que requieren asistencia, cubiertas y pendientes.</p>
        </div>
        <UserRoundCheck size={28} color="var(--brand)" aria-hidden="true" />
      </header>

      <section className="stat-grid coverage-stats" aria-label="Resumen de cobertura">
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

      <section className="content-section">
        {rows.length === 0 ? (
          <div className="empty-state"><UserRoundCheck size={24} aria-hidden="true" /><p>No hay instancias para ese filtro.</p></div>
        ) : (
          <div className="table-wrap">
            <table className="data-table coverage-table">
              <thead>
                <tr>
                  <th>Fecha</th>
                  <th>Reunión</th>
                  <th>Docente / Programa</th>
                  <th>Sala</th>
                  <th>Cobertura</th>
                  <th>Asignar</th>
                  <th>Acceso</th>
                </tr>
              </thead>
              <tbody>
                {rows.map(({ meeting, assignment, covered }) => {
                  const association = meeting.solicitud.docentePrograma;
                  const meet = meeting.eventosProveedor.find(({ proveedor }) => proveedor.tipo === "GOOGLE_MEET");
                  const assistantName = assignment
                    ? [assignment.asistente.usuario.nombres, assignment.asistente.usuario.apellidos].filter(Boolean).join(" ")
                    : null;
                  const applicants = meeting.intereses.map((interest) => ({
                    id: interest.asistente.id,
                    name: [interest.asistente.usuario.nombres, interest.asistente.usuario.apellidos].filter(Boolean).join(" ")
                  }));
                  return (
                    <tr key={meeting.id}>
                      <td className="date-cell">{formatDateTime(meeting.inicioProgramadoAt)}</td>
                      <td>
                        <Link className="meeting-title-link" href={`/reuniones/${meeting.solicitud.id}`}>{meeting.solicitud.titulo}</Link>
                        <small>{meeting.solicitud.modalidad.toLowerCase()} · {applicants.length} postulantes</small>
                      </td>
                      <td>
                        <strong>{association.docente.usuario.nombres} {association.docente.usuario.apellidos}</strong>
                        <small>{association.programa.nombre}</small>
                      </td>
                      <td>
                        <strong>{meet?.cuentaProveedor?.nombre ?? "Sin sala"}</strong>
                        <small>{meet?.codigoReunion ?? "Meet pendiente"}</small>
                      </td>
                      <td>
                        <span className={`status ${covered ? "status-ok" : "status-warning"}`}>
                          {covered ? "Cubierta" : "Pendiente"}
                        </span>
                        {assistantName ? <small>{assistantName}</small> : null}
                      </td>
                      <td>
                        <AssistantAssignmentSelect
                          assistants={assistantOptions}
                          applicants={applicants}
                          currentAssistantId={assignment?.asistenteId}
                          meetingId={meeting.id}
                          suggestedAssistant={suggestions.get(meeting.id) ?? null}
                        />
                      </td>
                      <td>
                        {meet?.joinUrl ? (
                          <a className="icon-link" href={meet.joinUrl} rel="noreferrer" target="_blank" title="Abrir reunión">
                            <ExternalLink size={17} /><span className="sr-only">Abrir reunión</span>
                          </a>
                        ) : <span className="muted-text">-</span>}
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

type SuggestionInput = Readonly<{
  meetings: readonly Readonly<{
    covered: boolean;
    meeting: {
      id: string;
      inicioProgramadoAt: Date;
      finProgramadoAt: Date;
      timezone: string;
      intereses: readonly Readonly<{ asistente: { id: string } }>[];
    };
  }>[];
  assistants: readonly Readonly<{ id: string; name: string }>[];
  assignments: readonly Readonly<{
    assistantId: string;
    meetingId: string;
    startsAt: Date;
    endsAt: Date;
    timezone: string;
  }>[];
}>;

function buildAssignmentSuggestions(input: SuggestionInput) {
  const assistantById = new Map(input.assistants.map((assistant) => [assistant.id, assistant]));
  const monthlyLoads = new Map<string, number>();
  const schedules = new Map<string, Array<readonly [number, number]>>();

  for (const assignment of input.assignments) {
    const minutes = minutesBetween(assignment.startsAt, assignment.endsAt);
    const loadKey = `${assignment.assistantId}:${monthKey(assignment.startsAt, assignment.timezone)}`;
    monthlyLoads.set(loadKey, (monthlyLoads.get(loadKey) ?? 0) + minutes);
    const assistantSchedule = schedules.get(assignment.assistantId) ?? [];
    assistantSchedule.push([assignment.startsAt.getTime(), assignment.endsAt.getTime()]);
    schedules.set(assignment.assistantId, assistantSchedule);
  }

  const suggestions = new Map<string, { id: string; name: string; reason: string }>();
  const pendingMeetings = input.meetings
    .filter(({ covered }) => !covered)
    .map(({ meeting }) => meeting)
    .sort((left, right) => left.inicioProgramadoAt.getTime() - right.inicioProgramadoAt.getTime());

  for (const meeting of pendingMeetings) {
    const applicantIds = meeting.intereses
      .map((interest) => interest.asistente.id)
      .filter((assistantId) => assistantById.has(assistantId));
    const candidateIds = applicantIds.length > 0
      ? [...new Set(applicantIds)]
      : input.assistants.map(({ id }) => id);
    const startsAtMs = meeting.inicioProgramadoAt.getTime();
    const endsAtMs = meeting.finProgramadoAt.getTime();
    const keySuffix = monthKey(meeting.inicioProgramadoAt, meeting.timezone);
    const candidates = candidateIds
      .filter((assistantId) => !hasScheduleConflict(schedules.get(assistantId) ?? [], startsAtMs, endsAtMs))
      .sort((left, right) => {
        const leftLoad = monthlyLoads.get(`${left}:${keySuffix}`) ?? 0;
        const rightLoad = monthlyLoads.get(`${right}:${keySuffix}`) ?? 0;
        if (leftLoad !== rightLoad) return leftLoad - rightLoad;
        return (assistantById.get(left)?.name ?? left).localeCompare(assistantById.get(right)?.name ?? right, "es");
      });
    const selectedId = candidates[0];
    const selected = selectedId ? assistantById.get(selectedId) : null;
    if (!selected) continue;

    const loadBefore = monthlyLoads.get(`${selected.id}:${keySuffix}`) ?? 0;
    const meetingMinutes = minutesBetween(meeting.inicioProgramadoAt, meeting.finProgramadoAt);
    const reason = applicantIds.includes(selected.id)
      ? `Postulante con menor carga mensual (${formatLoad(loadBefore)})`
      : `Menor carga mensual disponible (${formatLoad(loadBefore)})`;
    suggestions.set(meeting.id, { id: selected.id, name: selected.name, reason });
    monthlyLoads.set(`${selected.id}:${keySuffix}`, loadBefore + meetingMinutes);
    schedules.set(selected.id, [...(schedules.get(selected.id) ?? []), [startsAtMs, endsAtMs]]);
  }

  return suggestions;
}

function hasScheduleConflict(schedule: readonly (readonly [number, number])[], startsAtMs: number, endsAtMs: number) {
  return schedule.some(([scheduledStart, scheduledEnd]) => startsAtMs < scheduledEnd && endsAtMs > scheduledStart);
}

function minutesBetween(start: Date, end: Date): number {
  return Math.max(0, Math.round((end.getTime() - start.getTime()) / 60000));
}

function monthKey(date: Date, timezone: string): string {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: timezone || "America/Montevideo",
    year: "numeric",
    month: "2-digit"
  }).formatToParts(date);
  const year = parts.find((part) => part.type === "year")?.value ?? String(date.getUTCFullYear());
  const month = parts.find((part) => part.type === "month")?.value ?? String(date.getUTCMonth() + 1).padStart(2, "0");
  return `${year}-${month}`;
}

function formatLoad(minutes: number): string {
  const hours = Math.floor(minutes / 60);
  const rest = minutes % 60;
  if (hours === 0) return `${rest} min`;
  return rest === 0 ? `${hours} h` : `${hours} h ${rest} min`;
}
