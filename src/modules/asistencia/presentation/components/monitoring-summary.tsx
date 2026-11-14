import Link from "next/link";

function plural(n: number, singular: string, pluralForm: string) {
  return `${n} ${n === 1 ? singular : pluralForm}`;
}

export function MonitoringSummary({
  total,
  covered,
  pending,
  q
}: Readonly<{ total: number; covered: number; pending: number; q?: string }>) {
  const params = new URLSearchParams({ estado: "pendientes" });
  if (q) {
    params.set("q", q);
  }
  const pendingLabel = plural(pending, "pendiente", "pendientes");

  return (
    <p className="monitoring-summary" aria-label="Resumen de cobertura">
      <span>{plural(total, "reunión", "reuniones")}</span>
      <span aria-hidden="true">·</span>
      <span>{plural(covered, "cubierta", "cubiertas")}</span>
      <span aria-hidden="true">·</span>
      {pending > 0 ? (
        <Link className="monitoring-summary-pending is-alert" href={`/monitoreo?${params.toString()}`}>
          {pendingLabel}
        </Link>
      ) : (
        <span>{pendingLabel}</span>
      )}
    </p>
  );
}
