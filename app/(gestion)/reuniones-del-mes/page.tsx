import { CalendarRange, Clock3 } from "lucide-react";
import { redirect } from "next/navigation";
import { auth } from "@/auth";
import { AssistantMonthList } from "@/src/components/assistant-month-list";
import { RefreshButton } from "@/src/components/refresh-button";
import { resolveSessionActor } from "@/src/lib/auth/session-actor.adapter";
import { db } from "@/src/lib/db";
import { formatMinutes, formatMoney, formatMonth } from "@/src/lib/ui/assistant-format";
import { resumirAsistencias } from "@/src/modules/asistencia/resumen-personal.domain";
import { obtenerAsistenciasPersonales } from "@/src/modules/asistencia/resumen-personal.adapter";

export default async function ReunionesDelMesPage() {
  const session = await auth();
  if (!session?.user) redirect("/acceso");
  const actor = await resolveSessionActor(db, { id: session.user.id, email: session.user.email });
  if (!actor?.activo || actor.rol !== "ASISTENTE_TECNICO") redirect("/");

  const ahora = new Date();
  const meetings = await obtenerAsistenciasPersonales(db, actor.id, "MES_ACTUAL", ahora);
  const summary = resumirAsistencias(meetings);

  return (
    <>
      <header className="page-header">
        <div>
          <p className="page-eyebrow">Asistencia técnica</p>
          <h1>Reuniones de {formatMonth(ahora)}</h1>
          <p>Horas e importes estimados del mes en curso.</p>
        </div>
        <RefreshButton />
      </header>

      <section className="assistant-mode-grid" aria-label="Resumen del mes">
        <div className="mode-summary virtual-summary"><Clock3 size={28} /><span><small>Virtuales</small><strong>{formatMinutes(summary.minutosVirtuales)}</strong><b>{formatMoney(summary.montoVirtual)}</b></span></div>
        <div className="mode-summary hybrid-summary"><Clock3 size={28} /><span><small>Híbridas</small><strong>{formatMinutes(summary.minutosHibridos)}</strong><b>{formatMoney(summary.montoHibrido)}</b></span></div>
      </section>
      <div className="estimated-total">Cotización total estimada: <strong>{formatMoney(summary.monto)}</strong></div>

      <section className="month-meetings">
        {meetings.length === 0
          ? <div className="empty-state"><CalendarRange size={24} /><p>No tenés reuniones asignadas este mes.</p></div>
          : <AssistantMonthList meetings={meetings} />}
      </section>
    </>
  );
}
