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
  const [meetings, assistants] = await Promise.all([
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
          select: { id: true }
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
                  return (
                    <tr key={meeting.id}>
                      <td className="date-cell">{formatDateTime(meeting.inicioProgramadoAt)}</td>
                      <td>
                        <Link className="meeting-title-link" href={`/reuniones/${meeting.solicitud.id}`}>{meeting.solicitud.titulo}</Link>
                        <small>{meeting.solicitud.modalidad.toLowerCase()} · {meeting.intereses.length} postulantes</small>
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
                          currentAssistantId={assignment?.asistenteId}
                          meetingId={meeting.id}
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
