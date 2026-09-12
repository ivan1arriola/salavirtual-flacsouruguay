import { ArrowRight, CalendarCheck2, Check, CheckCircle2 } from "lucide-react";
import Link from "next/link";
import { formatDate, formatTime } from "@/src/lib/ui/format";
import type { AssistantOpportunityDTO } from "@/src/modules/dashboard/types";

export function AssistantOpenOpportunities({
  opportunities
}: Readonly<{
  opportunities: readonly AssistantOpportunityDTO[];
}>) {
  if (opportunities.length === 0) {
    return (
      <p className="assistant-opportunities-empty">
        <CheckCircle2 size={16} /> No hay coberturas abiertas en este momento.
      </p>
    );
  }

  return (
    <section className="dashboard-content-section assistant-opportunities-section">
      <div className="section-heading">
        <div>
          <h2>Salas que buscan asistencia técnica</h2>
          <p>Instancias abiertas donde podés postularte para cubrir la sesión.</p>
        </div>
        <Link className="text-link" href="/agenda-abierta">
          Ver agenda abierta <ArrowRight size={16} />
        </Link>
      </div>

      {
        <div className="assistant-opportunities-grid">
          {opportunities.map((opp) => {
            const inicio = new Date(opp.inicioProgramadoAt);
            const fin = new Date(opp.finProgramadoAt);

            return (
              <article className="assistant-opportunity-card" key={opp.id}>
                <div className="assistant-opportunity-when">
                  <span className="assistant-opportunity-date">{formatDate(inicio)}</span>
                  <strong className="assistant-opportunity-time">
                    {formatTime(inicio)}–{formatTime(fin)}
                  </strong>
                  <span className="badge-tag">
                    {opp.modalidad === "HIBRIDA" ? "Híbrida" : "Virtual"}
                  </span>
                </div>

                <div className="assistant-opportunity-content">
                  <small className="assistant-opportunity-program">{opp.programa}</small>
                  <h3 className="assistant-opportunity-title">
                    <Link href={`/reuniones/${opp.solicitudId}`}>{opp.titulo}</Link>
                  </h3>
                </div>

                <div className="assistant-opportunity-actions">
                  {opp.yaPostulado ? (
                    <span className="status-badge status-ok">
                      <Check size={14} /> Ya te postulaste
                    </span>
                  ) : (
                    <Link className="primary-action opportunity-apply-btn" href="/agenda-abierta">
                      <CalendarCheck2 size={16} />
                      <span>Postularme</span>
                    </Link>
                  )}
                </div>
              </article>
            );
          })}
        </div>
      }
    </section>
  );
}

