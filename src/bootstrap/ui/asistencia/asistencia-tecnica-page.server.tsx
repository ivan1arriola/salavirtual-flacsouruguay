import { ArrowRight, CalendarDays, ClipboardCheck, Search, UsersRound } from "lucide-react";
import Link from "next/link";
import { redirect } from "next/navigation";
import { auth } from "@/auth";
import { BulkMonitoringNotificationActions } from "@/src/modules/asistencia/presentation/components/bulk-monitoring-notification-actions";
import { MonitoringMeetingRow } from "@/src/modules/asistencia/presentation/components/monitoring-meeting-row";
import { MonitoringSummary } from "@/src/modules/asistencia/presentation/components/monitoring-summary";
import { resolveSessionActor } from "@/src/lib/auth/session-actor.adapter";
import { db } from "@/src/lib/db";
import { seleccionarEventoProveedorActivo } from "@/src/modules/reuniones/evento-proveedor-activo.domain";
import {
  agruparPorDia,
  colorCuentaZoom,
  nombreCuentaZoom
} from "@/src/modules/reuniones/lista-zoom-agrupacion.domain";
import { formatTime } from "@/src/lib/ui/format";

const ACTIVE_ASSIGNMENTS = ["ASIGNADO", "ACEPTADO"] as const;

function coincideFiltroCobertura(covered: boolean, estado: string): boolean {
  if (estado === "pendientes") {
    return !covered;
  }
  if (estado === "cubiertas") {
    return covered;
  }
  return true;
}

function obtenerEstadoVacio(total: number, query: string) {
  if (total === 0 && query) {
    return {
      title: "No encontramos coincidencias",
      description: "Probá con otro término de búsqueda o quitá el filtro para volver a ver la agenda."
    };
  }
  if (total === 0) {
    return {
      title: "No hay reuniones próximas",
      description: "Cuando haya encuentros programados que requieran monitoreo, aparecerán en esta agenda."
    };
  }
  return {
    title: "No encontramos reuniones para este filtro",
    description: "Probá con otro estado o quitá la búsqueda para volver a ver las reuniones."
  };
}

function etiquetaRelativaDia(relativo: string | null | undefined): string | null {
  if (relativo === "HOY") {
    return "Hoy";
  }
  if (relativo === "MANANA") {
    return "Mañana";
  }
  return null;
}

function obtenerEtiquetaHost(
  cuenta: { nombre: string; emailOrganizador: string | null } | null | undefined,
  isZoom: boolean,
  hostEmail: string | null | undefined
): string | null {
  if (!cuenta) {
    return null;
  }
  const nombre = isZoom && hostEmail ? nombreCuentaZoom(hostEmail) : cuenta.nombre;
  return cuenta.emailOrganizador ? nombre + " · " + cuenta.emailOrganizador : nombre;
}

function obtenerPlataforma(isZoom: boolean, hasEvent: boolean): "ZOOM" | "GOOGLE_MEET" | null {
  if (isZoom) {
    return "ZOOM";
  }
  if (hasEvent) {
    return "GOOGLE_MEET";
  }
  return null;
}

export default async function AsistenciaTecnicaPage({
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
  const now = new Date();
  const meetings = await db.instanciaSala.findMany({
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
        select: { asistenteTecnicoId: true },
        orderBy: { createdAt: "asc" }
      },
      eventosProveedor: {
        include: { proveedor: true, cuentaProveedor: true }
      }
    }
  });

  const rows = meetings
    .map((meeting) => {
      const assignment = meeting.asignaciones[0] ?? null;
      return {
        meeting,
        assignment,
        covered: Boolean(assignment)
      };
    })
    .filter(({ covered }) => coincideFiltroCobertura(covered, estado));

  const total = meetings.length;
  const covered = meetings.filter(({ asignaciones }) => asignaciones.length > 0).length;
  const pending = total - covered;
  const applicantsCount = new Set(
    meetings.flatMap((meeting) => meeting.postulaciones.map(({ asistenteTecnicoId }) => asistenteTecnicoId))
  ).size;
  const days = agruparPorDia(rows, ({ meeting }) => meeting.inicioProgramadoAt, now);
  const emptyState = obtenerEstadoVacio(meetings.length, q);
  const filters = [
    { value: "todas", label: "Todas", count: total },
    { value: "pendientes", label: "Pendientes", count: pending },
    { value: "cubiertas", label: "Cubiertas", count: covered }
  ] as const;

  return (
    <div className="monitoring-dashboard">
      <header className="page-header monitoring-dashboard-header">
        <div>
          <p className="page-eyebrow">Centro de operaciones</p>
          <h1>Monitoreo de reuniones</h1>
          <p>Supervisá la cobertura técnica y las postulaciones de los próximos encuentros.</p>
        </div>
        <span className="monitoring-dashboard-header-icon" aria-hidden="true">
          <CalendarDays size={25} />
        </span>
      </header>

      <nav className="monitoring-view-tabs monitoring-dashboard-tabs" aria-label="Secciones de monitoreo">
        <Link className="is-active" href="/monitoreo" aria-current="page">
          <CalendarDays size={17} aria-hidden="true" />
          Reuniones
        </Link>
        <Link href="/monitoreo/gestion">
          <ClipboardCheck size={17} aria-hidden="true" />
          Gestión de coberturas
          <ArrowRight size={15} aria-hidden="true" />
        </Link>
      </nav>

      <MonitoringSummary
        total={total}
        covered={covered}
        pending={pending}
        applicantsCount={applicantsCount}
        q={q}
      />

      <section className="monitoring-controls" aria-label="Controles de la agenda">
        <div className="monitoring-controls-heading">
          <div>
            <h2>Agenda de monitoreo</h2>
            <p>Reuniones que requieren seguimiento técnico.</p>
          </div>
          <span className="monitoring-results-count">
            {rows.length} {rows.length === 1 ? "resultado" : "resultados"}
          </span>
        </div>

        <div className="monitoring-controls-row">
          <nav className="monitoring-status-filters" aria-label="Filtrar por cobertura">
            {filters.map((filter) => {
              const params = new URLSearchParams();
              if (filter.value !== "todas") {
                params.set("estado", filter.value);
              }
              if (q) {
                params.set("q", q);
              }
              const query = params.toString();
              return (
                <Link
                  key={filter.value}
                  className={"monitoring-status-filter " + (estado === filter.value ? "is-active" : "")}
                  href={query ? "/monitoreo?" + query : "/monitoreo"}
                  aria-current={estado === filter.value ? "page" : undefined}
                >
                  {filter.label}
                  <span>{filter.count}</span>
                </Link>
              );
            })}
          </nav>

          <div className="monitoring-toolbar-actions">
            <form className="monitoring-search-form" method="get">
              <input type="hidden" name="estado" value={estado} />
              <label className="sr-only" htmlFor="monitoring-search">
                Buscar reuniones
              </label>
              <div className="monitoring-search-field">
                <Search size={18} aria-hidden="true" />
                <input
                  id="monitoring-search"
                  defaultValue={q}
                  name="q"
                  placeholder="Reunión, programa o docente"
                  type="search"
                />
              </div>
              <button className="primary-action" type="submit">
                <Search size={16} aria-hidden="true" />
                Buscar
              </button>
            </form>
            <BulkMonitoringNotificationActions pendingCount={pending} coveredCount={covered} />
          </div>
        </div>
      </section>

      <section className="monitoring-results" aria-label="Reuniones que requieren monitoreo">
        {rows.length === 0 ? (
          <div className="monitoring-empty-state">
            <span className="monitoring-empty-icon" aria-hidden="true">
              <UsersRound size={25} />
            </span>
            <h2>{emptyState.title}</h2>
            <p>{emptyState.description}</p>
            {estado !== "todas" || q ? (
              <Link className="secondary-action" href="/monitoreo">
                Limpiar filtros
              </Link>
            ) : null}
          </div>
        ) : (
          <div className="monitoring-day-list">
            {days.map((day) => (
              <section
                className="monitoring-day-group"
                key={day.clave}
                aria-labelledby={"monitoring-day-" + day.clave}
              >
                <h2 className="monitoring-day-title" id={"monitoring-day-" + day.clave}>
                  <span className="monitoring-day-heading-main">
                    {etiquetaRelativaDia(day.relativo) ? (
                      <span className="monitoring-day-relative">{etiquetaRelativaDia(day.relativo)}</span>
                    ) : null}
                    {day.etiqueta}
                  </span>
                  <small>
                    {day.items.length} {day.items.length === 1 ? "reunión" : "reuniones"}
                  </small>
                </h2>
                <div className="monitoring-day-cards">
                  {day.items.map(({ meeting, assignment, covered }) => {
                    const association = meeting.solicitud.docentePrograma;
                    const event = seleccionarEventoProveedorActivo(meeting);
                    const isZoom =
                      event?.proveedor.tipo === "ZOOM" || event?.proveedor.tipo === "ZOOM_HISTORICO";
                    const hostEmail = isZoom ? event?.cuentaProveedor?.emailOrganizador : null;
                    const hostColor = colorCuentaZoom(hostEmail);
                    const assistantName = assignment
                      ? [
                          assignment.asistenteTecnico.usuario.nombres,
                          assignment.asistenteTecnico.usuario.apellidos
                        ]
                          .filter(Boolean)
                          .join(" ")
                      : null;
                    const modalidad = meeting.modalidadOverride ?? meeting.solicitud.modalidad;
                    const inicioAsistencia = meeting.inicioAsistenciaTecnicaAt ?? meeting.inicioProgramadoAt;
                    const finAsistencia = meeting.finAsistenciaTecnicaAt ?? meeting.finProgramadoAt;
                    const cuenta = event?.cuentaProveedor;
                    const hostLabel = obtenerEtiquetaHost(cuenta, isZoom, hostEmail);
                    const plataforma = obtenerPlataforma(isZoom, Boolean(event));
                    return (
                      <MonitoringMeetingRow
                        key={meeting.id}
                        data={{
                          id: meeting.id,
                          detalleHref: `/reuniones/${meeting.solicitud.id}`,
                          gestionarHref: `/monitoreo/gestionar/${meeting.id}`,
                          titulo: meeting.solicitud.titulo,
                          programa: association.programa.nombre,
                          docente:
                            association.docente.usuario.nombres + " " + association.docente.usuario.apellidos,
                          horaAsistencia:
                            formatTime(inicioAsistencia) + "–" + formatTime(finAsistencia) + " h",
                          covered,
                          assistantName,
                          plataforma,
                          joinUrl: event?.joinUrl ?? null,
                          hostLabel,
                          codigoReunion:
                            isZoom && event ? (event.codigoReunion ?? event.externalEventId ?? null) : null,
                          modalidad: modalidad === "HIBRIDA" ? "HIBRIDA" : "VIRTUAL",
                          horarioReunion:
                            modalidad === "HIBRIDA"
                              ? formatTime(meeting.inicioProgramadoAt) +
                                "–" +
                                formatTime(meeting.finProgramadoAt) +
                                " h"
                              : null,
                          applicantsCount: meeting.postulaciones.length,
                          cuenta: String(hostColor ?? "sin")
                        }}
                      />
                    );
                  })}
                </div>
              </section>
            ))}
          </div>
        )}
      </section>
    </div>
  );
}
