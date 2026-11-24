import { CalendarDays, ClipboardList, CircleAlert, UserRoundCheck } from "lucide-react";
import type { AdminDashboardData } from "@/src/modules/dashboard/admin-dashboard.adapter";

export function getAdminSummaryMetrics(metrics: AdminDashboardData["metrics"]) {
  return [
    {
      label: "Reuniones hoy",
      value: metrics.todayMeetings,
      copy: "Programadas para hoy",
      icon: CalendarDays,
      href: "/reuniones?vista=encuentros",
      tone: "brand"
    },
    {
      label: "Sin monitoreo",
      value: metrics.pendingAssistance,
      copy: "Próximas sin asignación",
      icon: UserRoundCheck,
      href: "/monitoreo?estado=pendientes",
      tone: "warning"
    },
    {
      label: "Incidencias abiertas",
      value: metrics.openIncidents,
      copy: "Requieren revisión",
      icon: CircleAlert,
      href: "/centro-operaciones",
      tone: "danger"
    },
    {
      label: "Solicitudes activas",
      value: metrics.openRequests,
      copy: "En registro o provisión",
      icon: ClipboardList,
      href: "/reuniones",
      tone: "neutral"
    },
    {
      label: "Próximos 7 días",
      value: metrics.weekMeetings,
      copy: "Reuniones programadas",
      icon: CalendarDays,
      href: "/reuniones?vista=encuentros",
      tone: "brand"
    }
  ] as const;
}
