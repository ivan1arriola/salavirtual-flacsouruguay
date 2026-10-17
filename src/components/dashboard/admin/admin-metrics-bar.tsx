import {
  CalendarClock,
  CalendarDays,
  CircleAlert,
  ClipboardList,
  Files,
  UserRoundCheck
} from "lucide-react";
import Link from "next/link";
import type { AdminDashboardData } from "@/src/modules/dashboard/admin-dashboard.adapter";

export function AdminMetricsBar({
  metrics
}: Readonly<{
  metrics: AdminDashboardData["metrics"];
}>) {
  const metricItems = [
    {
      label: "Solicitudes activas",
      value: metrics.openRequests,
      copy: "En registro o provisión",
      icon: ClipboardList,
      href: "/reuniones",
      tone: "neutral"
    },
    {
      label: "Reuniones de hoy",
      value: metrics.todayMeetings,
      copy: "Programadas hoy",
      icon: CalendarClock,
      href: "/reuniones",
      tone: "brand"
    },
    {
      label: "Próximos 7 días",
      value: metrics.weekMeetings,
      copy: "Carga operativa semanal",
      icon: CalendarDays,
      href: "/reuniones",
      tone: "brand"
    },
    {
      label: "Sin monitoreo",
      value: metrics.pendingAssistance,
      copy: "Necesitan cobertura",
      icon: UserRoundCheck,
      href: "/monitoreo?estado=pendientes",
      tone: metrics.pendingAssistance > 0 ? "warning" : "ok"
    },
    {
      label: "Fallas de Meet",
      value: metrics.integrationErrors,
      copy: "Requieren revisión",
      icon: CircleAlert,
      href: "/configuracion",
      tone: metrics.integrationErrors > 0 ? "danger" : "ok"
    },
    {
      label: "Grabaciones pendientes",
      value: metrics.pendingRecordings,
      copy: "Esperando Drive",
      icon: Files,
      href: "/grabaciones",
      tone: "neutral"
    }
  ] as const;

  return (
    <section className="dashboard-content-section admin-metrics-bar-section" aria-label="Indicadores consolidados">
      <div className="section-heading">
        <div>
          <h2>Indicadores operativos</h2>
          <p>Métricas de flujo y estado global de la infraestructura.</p>
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
              <Icon size={18} />
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

