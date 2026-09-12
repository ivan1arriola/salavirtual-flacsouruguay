import { CalendarPlus, UserCheck } from "lucide-react";
import type { Session } from "next-auth";
import Link from "next/link";
import { AdminMetricsBar } from "@/src/components/dashboard/admin/admin-metrics-bar";
import { AdminTodayTimeline } from "@/src/components/dashboard/admin/admin-today-timeline";
import { AdminTriageSection } from "@/src/components/dashboard/admin/admin-triage-section";
import { DashboardHeader } from "@/src/components/dashboard/dashboard-header";
import { db } from "@/src/lib/db";
import { obtenerDashboardAdministracion } from "@/src/modules/dashboard/admin-dashboard.adapter";

export async function AdminDashboard({
  user
}: Readonly<{
  user: Session["user"];
}>) {
  const ahora = new Date();
  const data = await obtenerDashboardAdministracion(db, ahora);

  return (
    <div className="role-dashboard admin-dashboard-redesigned" data-tour="admin-dashboard">
      <DashboardHeader
        actions={
          <>
            <Link className="secondary-action" href="/asistencia-tecnica">
              <UserCheck size={16} />
              <span>Gestionar asistencia</span>
            </Link>
            <Link className="primary-action" href="/reuniones/nueva">
              <CalendarPlus size={17} />
              <span>Nueva reunión</span>
            </Link>
          </>
        }
        role="ADMINISTRACION"
        userName={user.name ?? "Administración"}
      />

      <AdminTriageSection attentionData={data.attentionData} />

      <AdminTodayTimeline meetings={data.todayTimeline} />

      <AdminMetricsBar metrics={data.metrics} />
    </div>
  );
}

