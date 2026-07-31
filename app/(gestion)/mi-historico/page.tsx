import { History } from "lucide-react";
import { redirect } from "next/navigation";
import { auth } from "@/auth";
import { AssistantMeetingsTable } from "@/src/components/assistant-meetings-table";
import { resolveSessionActor } from "@/src/lib/auth/session-actor.adapter";
import { db } from "@/src/lib/db";
import { formatMinutes, formatMoney, formatMonth } from "@/src/lib/ui/assistant-format";
import { agruparPorMes, resumirAsistencias } from "@/src/modules/asistencia/resumen-personal.domain";
import { obtenerAsistenciasPersonales } from "@/src/modules/asistencia/resumen-personal.adapter";

export default async function MiHistoricoPage() {
  const session = await auth();
  if (!session?.user) redirect("/acceso");
  const actor = await resolveSessionActor(db, { id: session.user.id, email: session.user.email });
  if (!actor?.activo || actor.rol !== "ASISTENTE") redirect("/");

  const meetings = await obtenerAsistenciasPersonales(db, actor.id, "HISTORICO");
  const periods = agruparPorMes(meetings);

  return (
    <>
      <header className="page-header">
        <div><p className="page-eyebrow">Asistencia</p><h1>Mi histórico</h1><p>Horas e importes personales de meses anteriores.</p></div>
        <History size={28} color="var(--brand)" aria-hidden="true" />
      </header>

      {periods.length === 0 ? (
        <section className="content-section"><div className="empty-state"><History size={24} /><p>Todavía no tenés reuniones en meses anteriores.</p></div></section>
      ) : (
        <div className="period-list">
          {periods.map((period) => {
            const periodSummary = resumirAsistencias(period.registros);
            return (
              <section className="content-section" key={period.clave}>
                <div className="section-heading">
                  <div><h2>{formatMonth(period.registros[0].inicioAt)}</h2><p>{periodSummary.reuniones} reuniones · {formatMinutes(periodSummary.minutosVirtuales + periodSummary.minutosHibridos)} horas · {formatMoney(periodSummary.monto)}</p></div>
                </div>
                <AssistantMeetingsTable meetings={period.registros} />
              </section>
            );
          })}
        </div>
      )}
    </>
  );
}
