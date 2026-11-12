import {
  CalendarDays,
  ChevronRight,
  Clock3,
  Download,
  Search,
  SlidersHorizontal,
  UsersRound,
  Video,
  Wallet
} from "lucide-react";
import Link from "next/link";
import { redirect } from "next/navigation";
import { auth } from "@/auth";
import { AssistantPeriodNav } from "@/src/modules/asistencia/presentation/components/assistant-period-nav";
import { db } from "@/src/lib/db";
import { formatMinutes, formatMoney, formatMonth } from "@/src/lib/ui/assistant-format";
import { obtenerResumenAsistentes } from "@/src/modules/asistencia/resumen-administracion.adapter";
import {
  resolverPeriodoMes,
  resumirTotales,
  type MontoMoneda
} from "@/src/modules/asistencia/resumen-administracion.domain";
import { etiquetaMes, periodoMesAnteriorUtc3 } from "@/src/modules/asistencia/reporte-mensual.domain";

export default async function AsistentesPage({
  searchParams
}: Readonly<{ searchParams: Promise<{ mes?: string; estado?: string; q?: string; orden?: string }> }>) {
  const session = await auth();
  if (session?.user.role !== "ADMINISTRACION") {
    redirect("/");
  }
  const query = await searchParams;
  const period = resolverPeriodoMes(query.mes, new Date());
  const paymentPeriod = periodoMesAnteriorUtc3(new Date());
  const now = new Date();
  const [assistants, profiles, futureAssignments] = await Promise.all([
    obtenerResumenAsistentes(db, period),
    db.asistenteTecnico.findMany({
      select: {
        id: true,
        disponibleGeneral: true,
        cesadoHastaProximoInicioSesion: true,
        usuario: {
          select: {
            activo: true,
            ultimoAccesoAt: true,
            cuentasGoogle: { select: { id: true } }
          }
        }
      }
    }),
    db.asignacionAsistenciaTecnica.findMany({
      where: {
        estado: { in: ["ASIGNADO", "ACEPTADO"] },
        instancia: {
          estado: "PROGRAMADA",
          finProgramadoAt: { gte: now }
        }
      },
      select: {
        asistenteTecnicoId: true,
        instancia: { select: { inicioProgramadoAt: true } }
      },
      orderBy: { instancia: { inicioProgramadoAt: "asc" } }
    })
  ]);
  const totals = resumirTotales(assistants);
  const profileById = new Map(profiles.map((profile) => [profile.id, profile]));
  const futureByAssistant = new Map<string, { count: number; next: Date | null }>();
  for (const assignment of futureAssignments) {
    const current = futureByAssistant.get(assignment.asistenteTecnicoId) ?? { count: 0, next: null };
    futureByAssistant.set(assignment.asistenteTecnicoId, {
      count: current.count + 1,
      next: current.next ?? assignment.instancia.inicioProgramadoAt
    });
  }
  const q = (query.q ?? "").trim().toLocaleLowerCase("es");
  const estado = ["todos", "operativos", "pausados", "cesados", "inactivos"].includes(query.estado ?? "")
    ? (query.estado ?? "todos")
    : "todos";
  const visibleAssistants = assistants.filter((assistant) => {
    const profile = profileById.get(assistant.id);
    const status = assistantStatus(
      assistant.activo,
      profile?.disponibleGeneral ?? false,
      profile?.cesadoHastaProximoInicioSesion ?? false
    );
    if (estado !== "todos" && status !== estado) {
      return false;
    }
    if (!q) {
      return true;
    }
    return [assistant.nombre, assistant.email ?? "", assistant.usuarioId]
      .join(" ")
      .toLocaleLowerCase("es")
      .includes(q);
  });
  const orden = ["nombre", "proximas", "reuniones", "horas"].includes(query.orden ?? "")
    ? (query.orden ?? "nombre")
    : "nombre";
  const collator = new Intl.Collator("es-UY", { sensitivity: "base", numeric: true });
  const sortedVisibleAssistants = [...visibleAssistants].sort((left, right) => {
    const byName = collator.compare(left.nombre, right.nombre);
    if (orden === "proximas") {
      return (
        (futureByAssistant.get(right.id)?.count ?? 0) - (futureByAssistant.get(left.id)?.count ?? 0) || byName
      );
    }
    if (orden === "reuniones") {
      return right.reuniones - left.reuniones || byName;
    }
    if (orden === "horas") {
      return right.minutos - left.minutos || byName;
    }
    return byName;
  });
  const statusFilters = [
    { value: "todos", label: "Todos" },
    { value: "operativos", label: "Operativos" },
    { value: "pausados", label: "Pausados" },
    { value: "cesados", label: "Cesados" },
    { value: "inactivos", label: "Inactivos" }
  ];
  const hrefForStatus = (value: string) => {
    const params = new URLSearchParams({ mes: period.clave, estado: value });
    if (query.q?.trim()) {
      params.set("q", query.q.trim());
    }
    if (orden !== "nombre") {
      params.set("orden", orden);
    }
    return `/asistentes?${params.toString()}`;
  };
  const operationalCount = profiles.filter(
    (profile) =>
      profile.usuario.activo && profile.disponibleGeneral && !profile.cesadoHastaProximoInicioSesion
  ).length;
  const pausedCount = profiles.filter(
    (profile) =>
      profile.usuario.activo && (!profile.disponibleGeneral || profile.cesadoHastaProximoInicioSesion)
  ).length;

  return (
    <div className="assistants-directory">
      <header className="page-header assistant-detail-header">
        <div className="assistant-directory-heading">
          <p className="page-eyebrow">Administración</p>
          <h1>Asistentes de monitoreo</h1>
          <p>Asignaciones y pagos estimados de {formatMonth(new Date(period.desdeMs))}.</p>
        </div>
        <div className="assistant-detail-actions">
          <AssistantPeriodNav period={period} basePath="/asistentes" />
        </div>
      </header>

      <section className="assistant-directory-summary" aria-label="Totales del período">
        <div className="assistant-directory-metrics">
          <article className="assistant-directory-metric">
            <span className="assistant-directory-metric-icon" aria-hidden="true">
              <UsersRound size={22} />
            </span>
            <div>
              <span>Operativos ahora</span>
              <strong>{operationalCount}</strong>
              <small>{pausedCount} pausados o cesados</small>
            </div>
          </article>
          <article className="assistant-directory-metric">
            <span className="assistant-directory-metric-icon" aria-hidden="true">
              <CalendarDays size={22} />
            </span>
            <div>
              <span>Reuniones del mes</span>
              <strong>{totals.reuniones}</strong>
              <small>En el período seleccionado</small>
            </div>
          </article>
          <article className="assistant-directory-metric">
            <span className="assistant-directory-metric-icon" aria-hidden="true">
              <Clock3 size={22} />
            </span>
            <div>
              <span>Horas del mes</span>
              <strong>{formatMinutes(totals.minutos)}</strong>
              <small>Tiempo registrado</small>
            </div>
          </article>
          <article className="assistant-directory-metric">
            <span className="assistant-directory-metric-icon is-money" aria-hidden="true">
              <Wallet size={22} />
            </span>
            <div>
              <span>Pago estimado</span>
              <strong>{formatAmounts(totals.montos)}</strong>
              <small>
                {totals.sinTarifa ? `${totals.sinTarifa} sin tarifa definida` : "Según tarifas registradas"}
              </small>
            </div>
          </article>
        </div>
        <a
          className="assistant-payments-download"
          href="/api/v1/asistencia/planilla-pagos"
          title="Descargar planilla de pagos del mes anterior"
        >
          <span className="assistant-payments-download-icon">
            <Download size={18} aria-hidden="true" />
          </span>
          <span>Descargar pagos de {etiquetaMes(paymentPeriod.clave)}</span>
          <ChevronRight size={19} aria-hidden="true" />
        </a>
      </section>

      <section className="assistant-directory-filters" aria-label="Buscar y filtrar asistentes">
        <form className="assistant-admin-filter" method="get">
          <input name="mes" type="hidden" value={period.clave} />
          <input name="orden" type="hidden" value={orden} />
          <label>
            <Search size={19} aria-hidden="true" />
            <input
              aria-label="Buscar asistente de monitoreo"
              defaultValue={query.q ?? ""}
              name="q"
              placeholder="Buscar por nombre o correo"
              type="search"
            />
          </label>
          <select aria-label="Filtrar estado operativo" defaultValue={estado} name="estado">
            <option value="todos">Todos</option>
            <option value="operativos">Operativos</option>
            <option value="pausados">Pausados</option>
            <option value="cesados">Cesados</option>
            <option value="inactivos">Inactivos</option>
          </select>
          <button className="secondary-action" type="submit">
            <SlidersHorizontal size={17} aria-hidden="true" /> Aplicar filtros
          </button>
        </form>
        <nav className="assistant-status-filters" aria-label="Filtrar asistentes por estado">
          {statusFilters.map((filter) => (
            <Link
              aria-current={estado === filter.value ? "page" : undefined}
              className={`assistant-status-filter${estado === filter.value ? " is-active" : ""}`}
              href={hrefForStatus(filter.value)}
              key={filter.value}
            >
              <span className={`assistant-filter-dot is-${filter.value}`} aria-hidden="true" />
              {filter.label}
            </Link>
          ))}
        </nav>
      </section>

      <section
        className="content-section assistants-summary-section"
        aria-labelledby="assistants-directory-title"
      >
        <div className="section-heading assistant-directory-list-heading">
          <div>
            <h2 id="assistants-directory-title">Detalle por asistente de monitoreo</h2>
            <p>
              {sortedVisibleAssistants.length} de {assistants.length} personas visibles.
            </p>
          </div>
          <form className="assistant-directory-sort" method="get">
            <input name="mes" type="hidden" value={period.clave} />
            <input name="estado" type="hidden" value={estado} />
            <input name="q" type="hidden" value={query.q ?? ""} />
            <label htmlFor="assistant-directory-sort-order">Ordenar por</label>
            <select id="assistant-directory-sort-order" name="orden" defaultValue={orden}>
              <option value="nombre">Nombre</option>
              <option value="proximas">Próximas reuniones</option>
              <option value="reuniones">Reuniones del mes</option>
              <option value="horas">Horas del mes</option>
            </select>
            <button type="submit" className="assistant-directory-sort-button">
              Ordenar
            </button>
          </form>
        </div>
        <div className="assistant-monitor-list">
          {sortedVisibleAssistants.map((assistant, index) => {
            const detailHref = `/asistentes/${encodeURIComponent(assistant.slug)}?mes=${period.clave}`;
            const profile = profileById.get(assistant.id);
            const future = futureByAssistant.get(assistant.id) ?? { count: 0, next: null };
            const status = assistantStatus(
              assistant.activo,
              profile?.disponibleGeneral ?? false,
              profile?.cesadoHastaProximoInicioSesion ?? false
            );
            return (
              <article className="assistant-monitor-card" key={assistant.id}>
                <div className="assistant-monitor-card-header">
                  <span className={`assistant-monitor-avatar tone-${index % 5}`} aria-hidden="true">
                    {assistantInitials(assistant.nombre)}
                  </span>
                  <div className="assistant-monitor-identity">
                    <Link className="assistant-monitor-name" href={detailHref}>
                      {assistant.nombre}
                    </Link>
                    <span className="assistant-monitor-email">{assistant.email ?? assistant.usuarioId}</span>
                    <small>
                      {profile?.usuario.cuentasGoogle.length
                        ? `${profile.usuario.cuentasGoogle.length} cuenta(s) Google`
                        : "Sin cuenta Google"}
                    </small>
                  </div>
                  <span className={`status assistant-monitor-status ${assistantStatusClass(status)}`}>
                    <span className="assistant-monitor-status-dot" aria-hidden="true" />
                    {assistantStatusLabel(status)}
                  </span>
                  <Link
                    className="assistant-monitor-detail-link"
                    href={detailHref}
                    aria-label={`Ver detalle de ${assistant.nombre}`}
                    title="Controlar asistente de monitoreo"
                  >
                    <ChevronRight size={22} aria-hidden="true" />
                  </Link>
                </div>
                <dl className="assistant-monitor-card-metrics">
                  <div className="assistant-monitor-card-metric">
                    <dt>
                      <CalendarDays size={16} aria-hidden="true" /> Próximas
                    </dt>
                    <dd>
                      <strong>{future.count}</strong>
                      <small>
                        {future.next
                          ? future.next.toLocaleDateString("es-UY", {
                              timeZone: "America/Montevideo",
                              day: "2-digit",
                              month: "short"
                            })
                          : "Sin próximas"}
                      </small>
                    </dd>
                  </div>
                  <div className="assistant-monitor-card-metric">
                    <dt>
                      <Video size={16} aria-hidden="true" /> Mes
                    </dt>
                    <dd>
                      <strong>{assistant.reuniones}</strong>
                      <small>
                        {assistant.virtuales} virtuales · {assistant.hibridas} híbridas
                      </small>
                    </dd>
                  </div>
                  <div className="assistant-monitor-card-metric">
                    <dt>
                      <Clock3 size={16} aria-hidden="true" /> Horas
                    </dt>
                    <dd>
                      <strong>{formatMinutes(assistant.minutos)}</strong>
                      <small>Registradas</small>
                    </dd>
                  </div>
                  <div className="assistant-monitor-card-metric">
                    <dt>
                      <Wallet size={16} aria-hidden="true" /> Pago estimado
                    </dt>
                    <dd>
                      <strong>{formatAmounts(assistant.montos)}</strong>
                      {assistant.sinTarifa ? (
                        <small className="missing-rate">{assistant.sinTarifa} sin tarifa</small>
                      ) : (
                        <small>Estimado</small>
                      )}
                    </dd>
                  </div>
                </dl>
              </article>
            );
          })}
          {sortedVisibleAssistants.length === 0 ? (
            <div className="assistant-directory-empty">
              <UsersRound size={26} aria-hidden="true" />
              <strong>No hay asistentes para ese filtro.</strong>
              <Link href={`/asistentes?mes=${encodeURIComponent(period.clave)}`}>
                Ver todos los asistentes
              </Link>
            </div>
          ) : null}
        </div>
      </section>
    </div>
  );
}

function assistantInitials(name: string): string {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  return (
    parts.length > 1 ? `${parts[0][0]}${parts[parts.length - 1][0]}` : (parts[0]?.slice(0, 2) ?? "AM")
  ).toLocaleUpperCase("es-UY");
}

type AssistantStatus = "operativos" | "pausados" | "cesados" | "inactivos";

function assistantStatus(
  activo: boolean,
  disponibleGeneral: boolean,
  cesadoHastaProximoInicioSesion: boolean
): AssistantStatus {
  if (!activo) {
    return "inactivos";
  }
  if (cesadoHastaProximoInicioSesion) {
    return "cesados";
  }
  if (!disponibleGeneral) {
    return "pausados";
  }
  return "operativos";
}

function assistantStatusLabel(status: AssistantStatus): string {
  if (status === "operativos") {
    return "Operativo";
  }
  if (status === "pausados") {
    return "Asignaciones pausadas";
  }
  if (status === "cesados") {
    return "Cesado temporalmente";
  }
  return "Usuario inactivo";
}

function assistantStatusClass(status: AssistantStatus): string {
  if (status === "operativos") {
    return "status-ok";
  }
  if (status === "inactivos") {
    return "status-error";
  }
  return "status-warning";
}

function formatAmounts(amounts: readonly MontoMoneda[]): string {
  return amounts.length
    ? amounts.map(({ monto, moneda }) => formatMoney(monto, moneda)).join(" + ")
    : formatMoney(0);
}
