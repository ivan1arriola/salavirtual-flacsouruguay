import { CalendarRange } from "lucide-react";
import { redirect } from "next/navigation";
import { auth } from "@/auth";
import { AssistantMeetingsTable } from "@/src/components/assistant-meetings-table";
import { resolveSessionActor } from "@/src/lib/auth/session-actor.adapter";
import { db } from "@/src/lib/db";
import { formatMinutes, formatMoney, formatMonth } from "@/src/lib/ui/assistant-format";
import { resumirAsistencias } from "@/src/modules/asistencia/resumen-personal.domain";
import { obtenerAsistenciasPersonales } from "@/src/modules/asistencia/resumen-personal.adapter";

export default async function ReunionesDelMesPage() {
  const session = await auth();
  if (!session?.user) redirect("/acceso");
  const actor = await resolveSessionActor(db, { id: session.user.id, email: session.user.email });
  if (!actor?.activo || actor.rol !== "ASISTENTE") redirect("/");

  const ahora = new Date();
  const meetings = await obtenerAsistenciasPersonales(db, actor.id, "MES_ACTUAL", ahora);
  const summary = resumirAsistencias(meetings);

  return (
    <>
      <header className="page-header">
        <div>
          <p className="page-eyebrow">Asistencia</p>
          <h1>Reuniones de {formatMonth(ahora)}</h1>
          <p>Horas e importes estimados del mes en curso.</p>
        </div>
        <CalendarRange size={28} color="var(--brand)" aria-hidden="true" />
      </header>

      <section className="metric-grid" aria-label="Resumen del mes">
        <div className="stat"><span>Reuniones</span><strong>{summary.reuniones}</strong></div>
        <div className="stat"><span>Horas virtuales</span><strong>{formatMinutes(summary.minutosVirtuales)}</strong></div>
        <div className="stat"><span>Horas híbridas</span><strong>{formatMinutes(summary.minutosHibridos)}</strong></div>
        <div className="stat"><span>Importe estimado</span><strong>{formatMoney(summary.monto)}</strong></div>
      </section>

      <section className="content-section">
        {meetings.length === 0
          ? <div className="empty-state"><CalendarRange size={24} /><p>No tenés reuniones asignadas este mes.</p></div>
          : <AssistantMeetingsTable meetings={meetings} />}
      </section>
    </>
  );
}
