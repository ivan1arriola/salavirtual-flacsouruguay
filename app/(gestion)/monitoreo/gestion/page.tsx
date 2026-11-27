import { ArrowRight, CalendarDays, ClipboardCheck, Search, UsersRound } from "lucide-react";
import Link from "next/link";
import { redirect } from "next/navigation";
import { auth } from "@/auth";
import { db } from "@/src/lib/db";
import { resolveSessionActor } from "@/src/lib/auth/session-actor.adapter";
import { seleccionarEventoProveedorActivo } from "@/src/modules/reuniones/evento-proveedor-activo.domain";
import { agruparPorDia } from "@/src/modules/reuniones/lista-zoom-agrupacion.domain";
import { formatTime } from "@/src/lib/ui/format";
import { ManagementCoverageRow } from "@/src/modules/asistencia/presentation/components/management-coverage-row";

const FILTERS = [
  { value: "todas", label: "Todas" },
  { value: "pendientes", label: "Pendientes" },
  { value: "asignadas", label: "Asignadas" },
  { value: "postulaciones", label: "Con postulaciones" },
] as const;

function matchesFilter(estado: string, assigned: boolean, applicants: number): boolean {
  switch (estado) {
    case "pendientes":
      return !assigned;
    case "asignadas":
      return assigned;
    case "postulaciones":
      return applicants > 0;
    default:
      return true;
  }
}

function filterHref(estado: string, q: string): string {
  const params = new URLSearchParams({ estado });
  if (q) {
    params.set("q", q);
  }
  return "/monitoreo/gestion?" + params.toString();
}

function platformLabel(tipo: string | undefined): "Zoom" | "Google Meet" | "Sin plataforma" {
  if (tipo === "ZOOM" || tipo === "ZOOM_HISTORICO") {
    return "Zoom";
  }
  return tipo ? "Google Meet" : "Sin plataforma";
}

function relativeDay(value: string | null): string | null {
  switch (value) {
    case "HOY":
      return "Hoy";
    case "MANANA":
      return "Mañana";
    default:
      return null;
  }
}

export default async function GestionMonitoreoListado({
  searchParams,
}: Readonly<{ searchParams: Promise<{ estado?: string; q?: string }> }>) {
  const session = await auth();
  if (!session?.user) {
    redirect("/acceso");
  }
  const actor = await resolveSessionActor(db, { id: session.user.id, email: session.user.email });
  if (!actor?.activo || actor.rol !== "ADMINISTRACION") {
    redirect("/reuniones");
  }

  const params = await searchParams;
  const estado = FILTERS.find((filter) => filter.value === params.estado)?.value ?? "todas";
  const q = params.q?.trim() ?? "";
  const now = new Date();
  const meetings = await db.instanciaSala.findMany({
    where: {
      requiereAsistenciaTecnica: true,
      estado: "PROGRAMADA",
      inicioProgramadoAt: { gte: now },
      solicitud: q ? { titulo: { contains: q, mode: "insensitive" } } : undefined,
    },
    orderBy: [{ inicioProgramadoAt: "asc" }, { id: "asc" }],
    include: {
      solicitud: { select: { titulo: true, modalidad: true } },
      asignaciones: {
        where: { estado: { in: ["ASIGNADO", "ACEPTADO"] } },
        include: { asistenteTecnico: { include: { usuario: true } } },
      },
      postulaciones: { where: { estado: "ME_INTERESA" }, select: { asistenteTecnicoId: true } },
      eventosProveedor: { include: { proveedor: true } },
    },
  });
  const rows = meetings.filter((meeting) =>
    matchesFilter(estado, meeting.asignaciones.length > 0, meeting.postulaciones.length),
  );
  const pending = meetings.filter((meeting) => !meeting.asignaciones.length).length;
  const counts = {
    todas: meetings.length,
    pendientes: pending,
    asignadas: meetings.length - pending,
    postulaciones: meetings.filter((meeting) => meeting.postulaciones.length > 0).length,
  };
  const days = agruparPorDia(rows, (meeting) => meeting.inicioProgramadoAt, now);

  return (
    <div className="monitoring-dashboard monitoring-management-index">
      <header className="page-header monitoring-dashboard-header">
        <div>
          <p className="page-eyebrow">Centro de operaciones</p>
          <h1>Gestión de monitoreo</h1>
          <p>Asigná responsables y revisá las postulaciones de los próximos encuentros.</p>
        </div>
        <span className="monitoring-dashboard-header-icon" aria-hidden="true">
          <ClipboardCheck size={25} />
        </span>
      </header>

      <nav
        className="monitoring-view-tabs monitoring-dashboard-tabs"
        aria-label="Secciones de monitoreo"
      >
        <Link href="/monitoreo">
          <CalendarDays size={17} aria-hidden="true" />
          Reuniones
        </Link>
        <Link className="is-active" href="/monitoreo/gestion" aria-current="page">
          <ClipboardCheck size={17} aria-hidden="true" />
          Gestión de coberturas
        </Link>
      </nav>

      <section className="monitoring-controls" aria-label="Controles de cobertura">
        <div className="monitoring-controls-heading">
          <div>
            <h2>Encuentros para gestionar</h2>
            <p>
              {counts.asignadas} de {counts.todas} con cobertura asignada
            </p>
          </div>
          <span className="monitoring-results-count">{rows.length} resultados</span>
        </div>
        {pending > 0 ? (
          <Link className="management-pending-shortcut" href={filterHref("pendientes", q)}>
            <span>{pending} sin asignar</span>
            <span>
              Revisar pendientes <ArrowRight size={16} aria-hidden="true" />
            </span>
          </Link>
        ) : null}
        <nav
          className="monitoring-status-filters management-status-filters"
          aria-label="Filtrar por cobertura"
        >
          {FILTERS.map((filter) => (
            <Link
              key={filter.value}
              className={"monitoring-status-filter " + (estado === filter.value ? "is-active" : "")}
              href={filterHref(filter.value, q)}
              aria-current={estado === filter.value ? "page" : undefined}
            >
              {filter.label}
              <span>{counts[filter.value]}</span>
            </Link>
          ))}
        </nav>
        <form className="monitoring-search-form management-search-form" method="get">
          <input type="hidden" name="estado" value={estado} />
          <label className="sr-only" htmlFor="management-search">
            Buscar reunión
          </label>
          <div className="monitoring-search-field">
            <Search size={18} aria-hidden="true" />
            <input
              id="management-search"
              type="search"
              name="q"
              defaultValue={q}
              placeholder="Buscar por reunión"
            />
          </div>
          <button className="primary-action" type="submit">
            <Search size={16} aria-hidden="true" />
            Buscar
          </button>
        </form>
        {q ? (
          <Link className="management-clear-search" href={filterHref(estado, "")}>
            Quitar búsqueda
          </Link>
        ) : null}
      </section>

      <section className="monitoring-day-list" aria-label="Encuentros por fecha">
        {rows.length === 0 ? (
          <div className="monitoring-empty-state">
            <span className="monitoring-empty-icon" aria-hidden="true">
              <UsersRound size={25} />
            </span>
            <h2>No hay reuniones para este filtro</h2>
            <p>Probá otro estado o quitá la búsqueda para consultar los próximos encuentros.</p>
            <Link className="secondary-action" href="/monitoreo/gestion">
              Limpiar filtros
            </Link>
          </div>
        ) : (
          days.map((day) => (
            <section
              className="monitoring-day-group"
              key={day.clave}
              aria-labelledby={"management-day-" + day.clave}
            >
              <h2 className="monitoring-day-title" id={"management-day-" + day.clave}>
                <span className="monitoring-day-heading-main">
                  {day.relativo ? (
                    <span className="monitoring-day-relative">{relativeDay(day.relativo)}</span>
                  ) : null}
                  {day.etiqueta}
                </span>
                <small>
                  {day.items.length} {day.items.length === 1 ? "encuentro" : "encuentros"}
                </small>
              </h2>
              <div className="monitoring-day-cards">
                {day.items.map((meeting) => {
                  const event = seleccionarEventoProveedorActivo(meeting);
                  const assigned = meeting.asignaciones[0]?.asistenteTecnico.usuario;
                  const inicio = meeting.inicioAsistenciaTecnicaAt ?? meeting.inicioProgramadoAt;
                  const fin = meeting.finAsistenciaTecnicaAt ?? meeting.finProgramadoAt;
                  return (
                    <ManagementCoverageRow
                      key={meeting.id}
                      data={{
                        id: meeting.id,
                        title: meeting.solicitud.titulo,
                        platform: platformLabel(event?.proveedor.tipo),
                        modality: meeting.modalidadOverride ?? meeting.solicitud.modalidad,
                        schedule: formatTime(inicio) + "–" + formatTime(fin),
                        classSchedule:
                          formatTime(meeting.inicioProgramadoAt) +
                          "–" +
                          formatTime(meeting.finProgramadoAt),
                        assistantName: assigned
                          ? [assigned.nombres, assigned.apellidos].filter(Boolean).join(" ")
                          : null,
                        applicantsCount: meeting.postulaciones.length,
                      }}
                    />
                  );
                })}
              </div>
            </section>
          ))
        )}
      </section>
    </div>
  );
}
