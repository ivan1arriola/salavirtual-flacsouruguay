import { ChevronRight, UsersRound } from "lucide-react";
import Link from "next/link";
import { redirect } from "next/navigation";
import { auth } from "@/auth";
import { AssistantPeriodNav } from "@/src/components/assistant-period-nav";
import { db } from "@/src/lib/db";
import { formatMinutes, formatMoney, formatMonth } from "@/src/lib/ui/assistant-format";
import { assistantPathSegment, assistantSlug } from "@/src/lib/ui/assistant-route";
import { obtenerResumenAsistentes } from "@/src/modules/asistencia/resumen-administracion.adapter";
import { resolverPeriodoMes, resumirTotales, type MontoMoneda } from "@/src/modules/asistencia/resumen-administracion.domain";

export default async function AsistentesPage({
  searchParams
}: Readonly<{ searchParams: Promise<{ mes?: string }> }>) {
  const session = await auth();
  if (session?.user.role !== "ADMINISTRACION") redirect("/");
  const query = await searchParams;
  const period = resolverPeriodoMes(query.mes, new Date());
  const assistants = await obtenerResumenAsistentes(db, period);
  const totals = resumirTotales(assistants);
  const slugCounts = assistants.reduce<Map<string, number>>((counts, assistant) => {
    const slug = assistantSlug(assistant.nombre);
    counts.set(slug, (counts.get(slug) ?? 0) + 1);
    return counts;
  }, new Map());

  return (
    <>
      <header className="page-header">
        <div>
          <p className="page-eyebrow">Administración</p>
          <h1>Asistentes</h1>
          <p>Asignaciones y pagos estimados de {formatMonth(new Date(period.desdeMs))}.</p>
        </div>
        <AssistantPeriodNav period={period} basePath="/asistentes" />
      </header>

      <section className="metric-grid" aria-label="Totales del período">
        <div className="stat"><span>Asistentes activos</span><strong>{totals.asistentes}</strong></div>
        <div className="stat"><span>Reuniones asignadas</span><strong>{totals.reuniones}</strong></div>
        <div className="stat"><span>Horas asignadas</span><strong>{formatMinutes(totals.minutos)}</strong></div>
        <div className={`stat${totals.sinTarifa ? " alert-stat" : ""}`}><span>Pago estimado</span><strong>{formatAmounts(totals.montos)}</strong>{totals.sinTarifa ? <small>{totals.sinTarifa} sin tarifa</small> : null}</div>
      </section>

      <section className="content-section assistants-summary-section">
        <div className="section-heading"><div><h2>Detalle por asistente</h2><p>{assistants.length} personas registradas.</p></div><UsersRound size={23} color="var(--brand)" /></div>
        <div className="table-wrap">
          <table className="data-table assistants-summary-table">
            <thead><tr><th>Asistente</th><th>Reuniones</th><th>Modalidad</th><th>Horas</th><th>Pago estimado</th><th></th></tr></thead>
            <tbody>
              {assistants.map((assistant) => {
                const slug = assistantSlug(assistant.nombre);
                const segment = assistantPathSegment(
                  assistant.nombre,
                  assistant.usuarioId,
                  (slugCounts.get(slug) ?? 0) > 1
                );
                const detailHref = `/asistentes/${encodeURIComponent(segment)}?mes=${period.clave}`;
                return <tr key={assistant.id}>
                  <td><Link className="meeting-title-link" href={detailHref}>{assistant.nombre}</Link><small>{assistant.email ?? assistant.usuarioId}</small></td>
                  <td><strong>{assistant.reuniones}</strong></td>
                  <td><span>{assistant.virtuales} virtuales</span><small>{assistant.hibridas} híbridas</small></td>
                  <td>{formatMinutes(assistant.minutos)}</td>
                  <td><strong>{formatAmounts(assistant.montos)}</strong>{assistant.sinTarifa ? <small className="missing-rate">{assistant.sinTarifa} sin tarifa</small> : null}</td>
                  <td><Link className="icon-link" href={detailHref} title="Ver reuniones del asistente"><ChevronRight size={18} /><span className="sr-only">Ver reuniones del asistente</span></Link></td>
                </tr>
              })}
            </tbody>
          </table>
        </div>
      </section>
    </>
  );
}

function formatAmounts(amounts: readonly MontoMoneda[]): string {
  return amounts.length ? amounts.map(({ monto, moneda }) => formatMoney(monto, moneda)).join(" + ") : formatMoney(0);
}
