import { CalendarCheck2 } from "lucide-react";
import { redirect } from "next/navigation";
import { auth } from "@/auth";
import { MeetLinkActions } from "@/src/components/copy-meet-link-button";
import { resolveSessionActor } from "@/src/lib/auth/session-actor.adapter";
import { db } from "@/src/lib/db";
import { formatMonth } from "@/src/lib/ui/assistant-format";
import { formatDate, formatTime } from "@/src/lib/ui/format";
import { claveMesUtc3 } from "@/src/modules/asistencia/resumen-personal.domain";

export default async function MiAgendaPage() {
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

  const assignments = await db.asignacionAsistenciaTecnica.findMany({
    where: {
      asistenteTecnicoId: assistant.id,
      estado: { in: ["ASIGNADO", "ACEPTADO"] },
      instancia: {
        finProgramadoAt: { gte: new Date() },
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
  });

  const periods = [...new Set(
    assignments.map(({ instancia }) => claveMesUtc3(instancia.inicioProgramadoAt))
  )].map((clave) => ({
    clave,
    assignments: assignments.filter(
      ({ instancia }) => claveMesUtc3(instancia.inicioProgramadoAt) === clave
    )
  }));
  const nextAssignment = assignments[0];

  return (
    <div className="assistant-agenda-page">
      <header className="page-header assistant-agenda-header">
        <div>
          <p className="page-eyebrow">Asistencia técnica</p>
          <h1>Mi agenda</h1>
          <p>{assignments.length} {assignments.length === 1 ? "reunión próxima" : "reuniones próximas"}.</p>
        </div>
        {nextAssignment ? (
          <div className="assistant-agenda-next-summary">
            <CalendarCheck2 size={19} aria-hidden="true" />
            <span>
              <small>Próxima reunión</small>
              <strong>{formatDate(nextAssignment.instancia.inicioProgramadoAt)} · {formatTime(nextAssignment.instancia.inicioProgramadoAt)}</strong>
            </span>
          </div>
        ) : (
          <CalendarCheck2 size={28} color="var(--brand)" aria-hidden="true" />
        )}
      </header>

      {assignments.length === 0 ? (
        <section className="content-section">
          <div className="empty-state">
            <CalendarCheck2 size={24} aria-hidden="true" />
            <p>No tenés reuniones asignadas próximamente.</p>
          </div>
        </section>
      ) : (
        <div className="period-list assistant-agenda-periods">
          {periods.map((period) => (
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
      )}
    </div>
  );
}
