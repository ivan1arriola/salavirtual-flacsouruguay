import { ChevronRight, Download, UsersRound } from "lucide-react";
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
}: Readonly<{ searchParams: Promise<{ mes?: string }> }>) {
  const session = await auth();
  if (session?.user.role !== "ADMINISTRACION") redirect("/");
  const query = await searchParams;
  const period = resolverPeriodoMes(query.mes, new Date());
  const paymentPeriod = periodoMesAnteriorUtc3(new Date());
  const assistants = await obtenerResumenAsistentes(db, period);
  const totals = resumirTotales(assistants);

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
        <div className="stat"><span>Asistentes técnicos activos</span><strong>{totals.asistentes}</strong></div>
        <div className="stat"><span>Reuniones asignadas</span><strong>{totals.reuniones}</strong></div>
        <div className="stat"><span>Horas asignadas</span><strong>{formatMinutes(totals.minutos)}</strong></div>
        <div className={`stat${totals.sinTarifa ? " alert-stat" : ""}`}><span>Pago estimado</span><strong>{formatAmounts(totals.montos)}</strong>{totals.sinTarifa ? <small>{totals.sinTarifa} sin tarifa</small> : null}</div>
      </section>

      <section className="content-section assistants-summary-section">
        <div className="section-heading"><div><h2>Detalle por asistente técnico</h2><p>{assistants.length} personas registradas.</p></div><UsersRound size={23} color="var(--brand)" /></div>
        <div className="table-wrap">
          <table className="data-table assistants-summary-table">
            <thead><tr><th>Asistente técnico</th><th>Reuniones</th><th>Modalidad</th><th>Horas</th><th>Pago estimado</th><th></th></tr></thead>
            <tbody>
              {assistants.map((assistant) => {
                const detailHref = `/asistentes/${encodeURIComponent(assistant.slug)}?mes=${period.clave}`;
                return <tr key={assistant.id}>
                  <td><Link className="meeting-title-link" href={detailHref}>{assistant.nombre}</Link><small>{assistant.email ?? assistant.usuarioId}</small></td>
                  <td><strong>{assistant.reuniones}</strong></td>
                  <td><span>{assistant.virtuales} virtuales</span><small>{assistant.hibridas} híbridas</small></td>
                  <td>{formatMinutes(assistant.minutos)}</td>
                  <td><strong>{formatAmounts(assistant.montos)}</strong>{assistant.sinTarifa ? <small className="missing-rate">{assistant.sinTarifa} sin tarifa</small> : null}</td>
                  <td><Link className="icon-link" href={detailHref} title="Ver reuniones del asistente técnico"><ChevronRight size={18} /><span className="sr-only">Ver reuniones del asistente técnico</span></Link></td>
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
