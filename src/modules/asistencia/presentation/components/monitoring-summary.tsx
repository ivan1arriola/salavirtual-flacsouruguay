import { CalendarDays, CheckCircle2, CircleAlert, UsersRound } from "lucide-react";
import Link from "next/link";

function plural(n: number, singular: string, pluralForm: string) {
  return String(n) + " " + (n === 1 ? singular : pluralForm);
}

export function MonitoringSummary({
  total,
  covered,
  pending,
  applicantsCount = 0,
  q
}: Readonly<{
  total: number;
  covered: number;
  pending: number;
  applicantsCount?: number;
  q?: string;
}>) {
  const params = new URLSearchParams({ estado: "pendientes" });
  if (q) {
    params.set("q", q);
  }
  const coverageRate = total > 0 ? Math.round((covered / total) * 100) : 0;

  return (
    <section className="monitoring-dashboard-summary" aria-label="Resumen de cobertura">
      <article className="monitoring-stat">
        <span className="monitoring-stat-icon" aria-hidden="true">
          <CalendarDays size={20} />
        </span>
        <span className="monitoring-stat-label">Reuniones próximas</span>
        <strong>{total}</strong>
        <small>Programadas para seguimiento</small>
      </article>

      <article className="monitoring-stat is-covered">
        <span className="monitoring-stat-icon" aria-hidden="true">
          <CheckCircle2 size={20} />
        </span>
        <span className="monitoring-stat-label">Con cobertura</span>
        <strong>{covered}</strong>
        <small>Con responsable asignado</small>
      </article>

      <article className={"monitoring-stat " + (pending > 0 ? "is-alert" : "is-covered")}>
        <span className="monitoring-stat-icon" aria-hidden="true">
          <CircleAlert size={20} />
        </span>
        <span className="monitoring-stat-label">Sin asignar</span>
        <strong>{pending}</strong>
        {pending > 0 ? (
          <Link href={"/monitoreo?" + params.toString()}>Ver reuniones pendientes</Link>
        ) : (
          <small>No hay coberturas pendientes</small>
        )}
      </article>

      <article className="monitoring-stat is-applicants">
        <span className="monitoring-stat-icon" aria-hidden="true">
          <UsersRound size={20} />
        </span>
        <span className="monitoring-stat-label">Personas postuladas</span>
        <strong>{applicantsCount}</strong>
        <small>{plural(applicantsCount, "postulación activa", "postulaciones activas")}</small>
      </article>

      <div className="monitoring-coverage-progress">
        <div className="monitoring-coverage-progress-copy">
          <span>Cobertura de monitoreo</span>
          <strong>{coverageRate}%</strong>
        </div>
        <div
          className="monitoring-coverage-progress-track"
          role="progressbar"
          aria-label="Porcentaje de reuniones con cobertura asignada"
          aria-valuemin={0}
          aria-valuemax={100}
          aria-valuenow={coverageRate}
          aria-valuetext={covered + " de " + total + " reuniones cubiertas"}
        >
          <span style={{ width: coverageRate + "%" }} />
        </div>
        <small>
          {covered} de {total} reuniones tienen una persona asignada
        </small>
      </div>
    </section>
  );
}
