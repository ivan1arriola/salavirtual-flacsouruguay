import { ArrowRight, ArrowLeft, CalendarClock, UsersRound } from "lucide-react";
import Link from "next/link";
import { redirect } from "next/navigation";
import { auth } from "@/auth";
import { db } from "@/src/lib/db";
import { resolveSessionActor } from "@/src/lib/auth/session-actor.adapter";
import { seleccionarEventoProveedorActivo } from "@/src/modules/reuniones/evento-proveedor-activo.domain";
import { formatDate, formatTime } from "@/src/lib/ui/format";

export default async function GestionMonitoreoListado({
  searchParams
}: Readonly<{ searchParams: Promise<{ estado?: string; q?: string }> }>) {
  const session = await auth();
  if (!session?.user) {
    redirect("/acceso");
  }
  const actor = await resolveSessionActor(db, { id: session.user.id, email: session.user.email });
  if (!actor?.activo || actor.rol !== "ADMINISTRACION") {
    redirect("/reuniones");
  }
  const { estado = "todas", q = "" } = await searchParams;
  const meetings = await db.instanciaSala.findMany({
    where: {
      requiereAsistenciaTecnica: true,
      estado: "PROGRAMADA",
      inicioProgramadoAt: { gte: new Date() },
      solicitud: q ? { titulo: { contains: q, mode: "insensitive" } } : undefined
    },
    orderBy: { inicioProgramadoAt: "asc" },
    include: {
      solicitud: { select: { titulo: true } },
      asignaciones: {
        where: { estado: { in: ["ASIGNADO", "ACEPTADO"] } },
        include: { asistenteTecnico: { include: { usuario: true } } }
      },
      postulaciones: { where: { estado: "ME_INTERESA" } },
      eventosProveedor: { include: { proveedor: true } }
    }
  });
  const rows = meetings.filter((meeting) =>
    estado === "pendientes"
      ? meeting.asignaciones.length === 0
      : estado === "asignadas"
        ? meeting.asignaciones.length > 0
        : estado === "postulaciones"
          ? meeting.postulaciones.length > 0
          : true
  );
  const counts = {
    pendientes: meetings.filter((m) => !m.asignaciones.length).length,
    asignadas: meetings.filter((m) => m.asignaciones.length > 0).length,
    postulaciones: meetings.filter((m) => m.postulaciones.length > 0).length
  };
  return (
    <main className="monitoring-management-index">
      <Link className="monitoring-workflow-back" href="/monitoreo">
        <ArrowLeft size={18} /> Monitoreo
      </Link>
      <header className="page-header">
        <div>
          <p className="page-eyebrow">Administración</p>
          <h1>Gestión de monitoreo</h1>
          <p>Administrá las coberturas y postulaciones de las reuniones.</p>
        </div>
      </header>
      <nav className="monitoring-management-filters" aria-label="Estado de cobertura">
        {(["pendientes", "asignadas", "postulaciones"] as const).map((filter) => (
          <Link
            key={filter}
            className={estado === filter ? "is-active" : ""}
            href={`/monitoreo/gestion?estado=${filter}&q=${encodeURIComponent(q)}`}
          >
            {filter === "pendientes" ? "Pendientes" : filter === "asignadas" ? "Asignadas" : "Postulaciones"}{" "}
            ({counts[filter]})
          </Link>
        ))}
        <Link className={estado === "todas" ? "is-active" : ""} href="/monitoreo/gestion">
          Todas
        </Link>
      </nav>
      <form className="filter-bar coverage-filter" method="get">
        <input type="hidden" name="estado" value={estado} />
        <input
          type="search"
          name="q"
          defaultValue={q}
          aria-label="Buscar reunión"
          placeholder="Buscar por reunión"
        />
        <button className="secondary-action" type="submit">
          Buscar
        </button>
      </form>
      <section className="monitoring-management-list" aria-label="Reuniones">
        {rows.length === 0 ? (
          <p className="content-section empty-state">No hay reuniones para este filtro.</p>
        ) : (
          rows.map((meeting) => {
            const event = seleccionarEventoProveedorActivo(meeting);
            const zoom = event?.proveedor.tipo === "ZOOM" || event?.proveedor.tipo === "ZOOM_HISTORICO";
            const assigned = meeting.asignaciones[0]?.asistenteTecnico.usuario;
            return (
              <Link
                className="monitoring-management-row"
                href={`/monitoreo/gestionar/${meeting.id}`}
                key={meeting.id}
              >
                <div>
                  <span className={`monitoring-platform ${zoom ? "is-zoom" : "is-meet"}`}>
                    {zoom ? "Zoom" : event ? "Google Meet" : "Sin plataforma"}
                  </span>
                  <span className="monitoring-management-date">
                    <CalendarClock size={15} /> {formatDate(meeting.inicioProgramadoAt)} ·{" "}
                    {formatTime(meeting.inicioProgramadoAt)}–{formatTime(meeting.finProgramadoAt)}
                  </span>
                  <strong>{meeting.solicitud.titulo}</strong>
                  <small>
                    <UsersRound size={15} />{" "}
                    {assigned
                      ? `Asignada a ${assigned.nombres} ${assigned.apellidos}`
                      : "Cobertura pendiente"}{" "}
                    · {meeting.postulaciones.length} postulaciones
                  </small>
                </div>
                <ArrowRight size={18} aria-hidden="true" />
              </Link>
            );
          })
        )}
      </section>
    </main>
  );
}
