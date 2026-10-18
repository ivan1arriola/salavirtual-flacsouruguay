import { CalendarDays, ClipboardList } from "lucide-react";
import type { AdminDashboardData } from "@/src/modules/dashboard/admin-dashboard.adapter";

export function getAdminSummaryMetrics(metrics: AdminDashboardData["metrics"]) {
  return [
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
