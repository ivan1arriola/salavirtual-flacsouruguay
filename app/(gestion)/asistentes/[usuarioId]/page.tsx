import { ArrowLeft, UserRoundCog } from "lucide-react";
import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { auth } from "@/auth";
import { AssistantMeetingsTable } from "@/src/components/assistant-meetings-table";
import { AssistantPeriodNav } from "@/src/components/assistant-period-nav";
import { db } from "@/src/lib/db";
import { formatMinutes, formatMoney, formatMonth } from "@/src/lib/ui/assistant-format";
import { userIdFromAssistantPath } from "@/src/lib/ui/assistant-route";
import { resolverPeriodoMes } from "@/src/modules/asistencia/resumen-administracion.domain";
import { resumirAsistencias } from "@/src/modules/asistencia/resumen-personal.domain";
import { obtenerAsistenciasEnRango } from "@/src/modules/asistencia/resumen-personal.adapter";

export default async function AsistenteDetailPage({
  params,
  searchParams
}: Readonly<{
  params: Promise<{ usuarioId: string }>;
  searchParams: Promise<{ mes?: string }>;
}>) {
  const session = await auth();
  if (session?.user.role !== "ADMINISTRACION") redirect("/");
  const [{ usuarioId: pathSegment }, query] = await Promise.all([params, searchParams]);
  const period = resolverPeriodoMes(query.mes, new Date());
  const assistantBySlug = await db.asistente.findUnique({
    where: { slug: pathSegment },
    include: { usuario: true }
  });
  const assistant = assistantBySlug ?? await db.asistente.findUnique({
    where: { usuarioId: userIdFromAssistantPath(pathSegment) },
    include: { usuario: true }
  });
  if (!assistant) notFound();
  const usuarioId = assistant.usuarioId;
  const meetings = await obtenerAsistenciasEnRango(
    db,
    usuarioId,
    { desde: new Date(period.desdeMs), hasta: new Date(period.hastaMs) }
  );
  const summary = resumirAsistencias(meetings);
  const missingRates = meetings.filter(({ monto }) => monto === null).length;
  const name = `${assistant.usuario.nombres} ${assistant.usuario.apellidos ?? ""}`.trim();
  const canonicalSegment = assistant.slug;
  const basePath = `/asistentes/${encodeURIComponent(canonicalSegment)}`;
  if (pathSegment !== canonicalSegment) redirect(`${basePath}?mes=${period.clave}`);

  return (
    <>
      <Link className="recording-back" href={`/asistentes?mes=${period.clave}`}><ArrowLeft size={17} />Asistentes</Link>
      <header className="page-header assistant-detail-header">
        <div>
          <p className="page-eyebrow">Asistencia</p>
          <h1>{name}</h1>
          <p>Instancias asignadas en {formatMonth(new Date(period.desdeMs))}.</p>
        </div>
        <div className="assistant-detail-actions">
          <AssistantPeriodNav period={period} basePath={basePath} />
          <Link className="secondary-action" href={`/usuarios/${encodeURIComponent(usuarioId)}`}><UserRoundCog size={17} />Gestionar usuario</Link>
        </div>
      </header>

      <section className="metric-grid" aria-label="Resumen del asistente">
        <div className="stat"><span>Reuniones asignadas</span><strong>{summary.reuniones}</strong></div>
        <div className="stat"><span>Horas virtuales</span><strong>{formatMinutes(summary.minutosVirtuales)}</strong></div>
        <div className="stat"><span>Horas híbridas</span><strong>{formatMinutes(summary.minutosHibridos)}</strong></div>
        <div className={`stat${missingRates ? " alert-stat" : ""}`}><span>Pago estimado</span><strong>{formatMoney(summary.monto)}</strong>{missingRates ? <small>{missingRates} sin tarifa</small> : null}</div>
      </section>

      <section className="content-section">
        <div className="section-heading assistant-detail-list-heading"><div><h2>Reuniones e instancias</h2><p>{meetings.length} registros en el período.</p></div></div>
        {meetings.length ? <AssistantMeetingsTable meetings={meetings} /> : <div className="empty-state"><p>No tiene reuniones asignadas en este mes.</p></div>}
      </section>
    </>
  );
}
