import { CalendarPlus, ExternalLink, Search } from "lucide-react";
import Link from "next/link";
import { redirect } from "next/navigation";
import { auth } from "@/auth";
import {
  MeetIntegrationStatus,
  MeetPendingNotice
} from "@/src/components/meet-integration-status";
import { resolveSessionActor } from "@/src/lib/auth/session-actor.adapter";
import { db } from "@/src/lib/db";
import { formatDateTime } from "@/src/lib/ui/format";
import { puedeVerAgendaCompleta } from "@/src/modules/reuniones/reuniones.domain";

export default async function ReunionesPage({
  searchParams
}: Readonly<{ searchParams: Promise<{ q?: string }> }>) {
  const session = await auth();
  if (!session?.user) redirect("/acceso");
  const actor = await resolveSessionActor(db, {
    id: session.user.id,
    email: session.user.email
  });
  if (!actor?.activo || !puedeVerAgendaCompleta(actor.rol)) {
    redirect("/mi-agenda");
  }
  const { q = "" } = await searchParams;
  const now = new Date();
  const teacherFilter =
    actor.rol === "DOCENTE"
      ? { docentePrograma: { docente: { usuarioId: actor.id } } }
      : {};
  const meetings = await db.instanciaSala.findMany({
    where: {
      finProgramadoAt: { gte: now },
      solicitud: {
        ...teacherFilter,
        ...(q
          ? {
              OR: [
                { titulo: { contains: q, mode: "insensitive" as const } },
                {
                  docentePrograma: {
                    programa: { nombre: { contains: q, mode: "insensitive" as const } }
                  }
                }
              ]
            }
          : {})
      }
    },
    orderBy: { inicioProgramadoAt: "asc" },
    take: 100,
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
  const hasPendingMeet = meetings.some((meeting) =>
    meeting.eventosProveedor.some(
      ({ proveedor, estadoIntegracion }) =>
        proveedor.tipo === "GOOGLE_MEET" && estadoIntegracion === "PENDIENTE"
    )
  );

  return (
    <>
      <header className="page-header">
        <div>
          <p className="page-eyebrow">Operación</p>
          <h1>Agenda de reuniones</h1>
          <p>{meetings.length} instancias visibles.</p>
        </div>
        <Link className="primary-action" href="/reuniones/nueva">
          <CalendarPlus size={18} /> Nueva reunión
        </Link>
      </header>

      <form className="filter-bar" method="get">
        <Search size={18} aria-hidden="true" />
        <input
          aria-label="Buscar reuniones"
          defaultValue={q}
          name="q"
          placeholder="Buscar por título o programa"
          type="search"
        />
        <button className="secondary-action" type="submit">Buscar</button>
      </form>

      <section className="content-section">
        {hasPendingMeet ? <MeetPendingNotice /> : null}
        <div className="table-wrap">
          <table className="data-table">
            <thead>
              <tr>
                <th>Fecha y hora (UTC-3)</th><th>Reunión</th><th>Docente / Programa</th>
                <th>Proveedor</th><th>Estado</th><th>Acceso</th>
              </tr>
            </thead>
            <tbody>
              {meetings.map((meeting) => {
                const association = meeting.solicitud.docentePrograma;
                const event =
                  meeting.eventosProveedor.find(
                    ({ proveedor }) => proveedor.tipo === "GOOGLE_MEET"
                  ) ?? meeting.eventosProveedor[0];
                return (
                  <tr key={meeting.id}>
                    <td className="date-cell">{formatDateTime(meeting.inicioProgramadoAt)}</td>
                    <td><strong>{meeting.solicitud.titulo}</strong><small>{meeting.solicitud.modalidad.toLowerCase()}</small></td>
                    <td><strong>{association.docente.usuario.nombres} {association.docente.usuario.apellidos}</strong><small>{association.programa.nombre}</small></td>
                    <td>
                      <strong>{event?.cuentaProveedor?.nombre ?? event?.proveedor.nombre}</strong>
                      <small>
                        <MeetIntegrationStatus status={event?.estadoIntegracion} />
                      </small>
                    </td>
                    <td><span className={`status status-${statusTone(meeting.estado)}`}>{meeting.estado.toLowerCase().replace("_", " ")}</span></td>
                    <td>
                      {event?.joinUrl ? (
                        <a className="icon-link" href={event.joinUrl} rel="noreferrer" target="_blank" title="Abrir reunión">
                          <ExternalLink size={17} /><span className="sr-only">Abrir reunión</span>
                        </a>
                      ) : <span className="muted-text">—</span>}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </section>
    </>
  );
}

function statusTone(status: string): string {
  if (status === "CANCELADA" || status === "NO_REALIZADA") return "error";
  if (status === "FINALIZADA") return "neutral";
  return "ok";
}
