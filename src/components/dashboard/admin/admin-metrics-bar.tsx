import Link from "next/link";
import { ChartNoAxesCombined } from "lucide-react";
import type { AdminDashboardData } from "@/src/modules/dashboard/admin-dashboard.adapter";
import { getAdminSummaryMetrics } from "@/src/modules/dashboard/admin-dashboard-summary";

export function AdminMetricsBar({
  metrics
}: Readonly<{
  metrics: AdminDashboardData["metrics"];
}>) {
  const metricItems = getAdminSummaryMetrics(metrics);

  return (
    <section className="dashboard-content-section admin-metrics-bar admin-metrics-bar-section" aria-label="Indicadores generales">
      <div className="section-heading admin-dashboard-section-heading">
        <div className="admin-section-heading-copy">
          <span className="admin-section-icon"><ChartNoAxesCombined aria-hidden="true" size={20} /></span>
          <div>
            <h2>Indicadores generales</h2>
            <p>Solicitudes activas y reuniones de los próximos siete días.</p>
          </div>
        </div>
      </div>

      <div className="admin-metrics-bar-grid">
        {metricItems.map(({ label, value, copy, icon: Icon, href, tone }) => (
          <Link
            className={`admin-metric-card tone-${tone}`}
            href={href}
            key={label}
          >
            <span className="admin-metric-card-icon">
              <Icon size={18} aria-hidden="true" />
            </span>
            <div className="admin-metric-card-data">
              <small>{label}</small>
              <strong>{value}</strong>
              <em>{copy}</em>
            </div>
          </Link>
        ))}
      </div>
    </section>
  );
}
