import { CalendarCheck2, ExternalLink } from "lucide-react";
import { redirect } from "next/navigation";
import { auth } from "@/auth";
import { resolveSessionActor } from "@/src/lib/auth/session-actor.adapter";
import { db } from "@/src/lib/db";
import { formatDateTime } from "@/src/lib/ui/format";

export default async function MiAgendaPage() {
  const session = await auth();
  if (!session?.user) redirect("/acceso");
  const actor = await resolveSessionActor(db, {
    id: session.user.id,
    email: session.user.email
  });
  if (!actor?.activo || actor.rol !== "ASISTENTE") redirect("/");

  const assistant = await db.asistente.findUnique({
    where: { usuarioId: actor.id },
    select: { id: true }
  });
  if (!assistant) redirect("/");

  const assignments = await db.asignacionAsistente.findMany({
    where: {
      asistenteId: assistant.id,
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

  return (
    <>
      <header className="page-header">
        <div>
          <p className="page-eyebrow">Asistencia</p>
          <h1>Mi agenda</h1>
          <p>{assignments.length} reuniones asignadas.</p>
        </div>
        <CalendarCheck2 size={28} color="var(--brand)" aria-hidden="true" />
      </header>

      <section className="content-section">
        {assignments.length === 0 ? (
          <div className="empty-state">
            <CalendarCheck2 size={24} aria-hidden="true" />
            <p>No tenés reuniones asignadas próximamente.</p>
          </div>
        ) : (
          <div className="table-wrap">
            <table className="data-table">
              <thead><tr><th>Fecha y hora (UTC-3)</th><th>Reunión</th><th>Programa</th><th>Meet</th><th>Estado</th><th>Acceso</th></tr></thead>
              <tbody>
                {assignments.map((assignment) => {
                  const meeting = assignment.instancia;
                  const association = meeting.solicitud.docentePrograma;
                  const meet = meeting.eventosProveedor.find(
                    ({ proveedor }) => proveedor.tipo === "GOOGLE_MEET"
                  );
                  return (
                    <tr key={assignment.id}>
                      <td className="date-cell">{formatDateTime(meeting.inicioProgramadoAt)}</td>
                      <td><strong>{meeting.solicitud.titulo}</strong><small>{association.docente.usuario.nombres} {association.docente.usuario.apellidos}</small></td>
                      <td>{association.programa.nombre}</td>
                      <td><strong>{meet?.cuentaProveedor?.nombre ?? "Sin sala"}</strong><small>{meet?.codigoReunion ?? "Meet pendiente"}</small></td>
                      <td><span className="status status-ok">{assignment.estado === "ACEPTADO" ? "Confirmada" : "Asignada"}</span></td>
                      <td>{meet?.joinUrl ? <a className="icon-link" href={meet.joinUrl} target="_blank" rel="noreferrer" title="Abrir reunión"><ExternalLink size={17} /><span className="sr-only">Abrir reunión</span></a> : <span className="muted-text">—</span>}</td>
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
