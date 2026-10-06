import { ChevronRight, Download, Search, UsersRound } from "lucide-react";
import Link from "next/link";
import { redirect } from "next/navigation";
import { auth } from "@/auth";
import { AssistantPeriodNav } from "@/src/modules/asistencia/presentation/components/assistant-period-nav";
import { db } from "@/src/lib/db";
import { formatMinutes, formatMoney, formatMonth } from "@/src/lib/ui/assistant-format";
import { obtenerResumenAsistentes } from "@/src/modules/asistencia/resumen-administracion.adapter";
import { resolverPeriodoMes, resumirTotales, type MontoMoneda } from "@/src/modules/asistencia/resumen-administracion.domain";
import { etiquetaMes, periodoMesAnteriorUtc3 } from "@/src/modules/asistencia/reporte-mensual.domain";

export default async function AsistentesPage({
  searchParams
}: Readonly<{ searchParams: Promise<{ mes?: string; estado?: string; q?: string }> }>) {
  const session = await auth();
  if (session?.user.role !== "ADMINISTRACION") redirect("/");
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
    ? query.estado ?? "todos"
    : "todos";
  const visibleAssistants = assistants.filter((assistant) => {
    const profile = profileById.get(assistant.id);
    const status = assistantStatus(assistant.activo, profile?.disponibleGeneral ?? false, profile?.cesadoHastaProximoInicioSesion ?? false);
    if (estado !== "todos" && status !== estado) return false;
    if (!q) return true;
    return [assistant.nombre, assistant.email ?? "", assistant.usuarioId]
      .join(" ")
      .toLocaleLowerCase("es")
      .includes(q);
  });
  const operationalCount = profiles.filter((profile) =>
    profile.usuario.activo
    && profile.disponibleGeneral
    && !profile.cesadoHastaProximoInicioSesion
  ).length;
  const pausedCount = profiles.filter((profile) =>
    profile.usuario.activo
    && (!profile.disponibleGeneral || profile.cesadoHastaProximoInicioSesion)
  ).length;

  return (
    <>
      <header className="page-header assistant-detail-header">
        <div>
          <p className="page-eyebrow">Administración</p>
          <h1>Asistentes técnicos</h1>
          <p>Asignaciones y pagos estimados de {formatMonth(new Date(period.desdeMs))}.</p>
        </div>
        <div className="assistant-detail-actions">
          <AssistantPeriodNav period={period} basePath="/asistentes" />
          <a className="secondary-action" href="/api/v1/asistencia/planilla-pagos" title="Descargar planilla de pagos del mes anterior">
            <Download size={17} />
            Descargar pagos de {etiquetaMes(paymentPeriod.clave)}
          </a>
        </div>
      </header>

      <section className="metric-grid" aria-label="Totales del período">
        <div className="stat"><span>Operativos ahora</span><strong>{operationalCount}</strong><small>{pausedCount} pausados o cesados</small></div>
        <div className="stat"><span>Reuniones del mes</span><strong>{totals.reuniones}</strong></div>
        <div className="stat"><span>Horas del mes</span><strong>{formatMinutes(totals.minutos)}</strong></div>
        <div className={`stat${totals.sinTarifa ? " alert-stat" : ""}`}><span>Pago estimado</span><strong>{formatAmounts(totals.montos)}</strong>{totals.sinTarifa ? <small>{totals.sinTarifa} sin tarifa</small> : null}</div>
      </section>

      <form className="assistant-admin-filter" method="get">
        <input name="mes" type="hidden" value={period.clave} />
        <label>
          <Search size={17} aria-hidden="true" />
          <input
            aria-label="Buscar asistente técnico"
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
        <button className="secondary-action" type="submit">Filtrar</button>
      </form>

      <section className="content-section assistants-summary-section">
        <div className="section-heading"><div><h2>Detalle por asistente técnico</h2><p>{visibleAssistants.length} de {assistants.length} personas visibles.</p></div><UsersRound size={23} color="var(--brand)" /></div>
        <div className="table-wrap">
          <table className="data-table assistants-summary-table">
            <thead><tr><th>Asistente técnico</th><th>Estado</th><th>Próximas</th><th>Mes</th><th>Horas</th><th>Pago estimado</th><th></th></tr></thead>
            <tbody>
              {visibleAssistants.map((assistant) => {
                const detailHref = `/asistentes/${encodeURIComponent(assistant.slug)}?mes=${period.clave}`;
                const profile = profileById.get(assistant.id);
                const future = futureByAssistant.get(assistant.id) ?? { count: 0, next: null };
                const status = assistantStatus(assistant.activo, profile?.disponibleGeneral ?? false, profile?.cesadoHastaProximoInicioSesion ?? false);
                return <tr key={assistant.id}>
                  <td>
                    <Link className="meeting-title-link" href={detailHref}>{assistant.nombre}</Link>
                    <small>{assistant.email ?? assistant.usuarioId}</small>
                    <small>{profile?.usuario.cuentasGoogle.length ? `${profile.usuario.cuentasGoogle.length} cuenta(s) Google` : "Sin cuenta Google"}</small>
                  </td>
                  <td><span className={`status ${assistantStatusClass(status)}`}>{assistantStatusLabel(status)}</span></td>
                  <td><strong>{future.count}</strong>{future.next ? <small>{future.next.toLocaleDateString("es-UY", { timeZone: "America/Montevideo", day: "2-digit", month: "short" })}</small> : <small>Sin próximas</small>}</td>
                  <td><strong>{assistant.reuniones}</strong><small>{assistant.virtuales} virtuales · {assistant.hibridas} híbridas</small></td>
                  <td>{formatMinutes(assistant.minutos)}</td>
                  <td><strong>{formatAmounts(assistant.montos)}</strong>{assistant.sinTarifa ? <small className="missing-rate">{assistant.sinTarifa} sin tarifa</small> : null}</td>
                  <td><Link className="icon-link" href={detailHref} title="Controlar asistente técnico"><ChevronRight size={18} /><span className="sr-only">Controlar asistente técnico</span></Link></td>
                </tr>
              })}
              {visibleAssistants.length === 0 ? <tr><td className="empty-table-cell" colSpan={7}>No hay asistentes para ese filtro.</td></tr> : null}
            </tbody>
          </table>
        </div>
      </section>
    </>
  );
}

type AssistantStatus = "operativos" | "pausados" | "cesados" | "inactivos";

function assistantStatus(
  activo: boolean,
  disponibleGeneral: boolean,
  cesadoHastaProximoInicioSesion: boolean
): AssistantStatus {
  if (!activo) return "inactivos";
  if (cesadoHastaProximoInicioSesion) return "cesados";
  if (!disponibleGeneral) return "pausados";
  return "operativos";
}

function assistantStatusLabel(status: AssistantStatus): string {
  if (status === "operativos") return "Operativo";
  if (status === "pausados") return "Asignaciones pausadas";
  if (status === "cesados") return "Cesado temporalmente";
  return "Usuario inactivo";
}

function assistantStatusClass(status: AssistantStatus): string {
  if (status === "operativos") return "status-ok";
  if (status === "inactivos") return "status-error";
  return "status-warning";
}

function formatAmounts(amounts: readonly MontoMoneda[]): string {
  return amounts.length ? amounts.map(({ monto, moneda }) => formatMoney(monto, moneda)).join(" + ") : formatMoney(0);
}
