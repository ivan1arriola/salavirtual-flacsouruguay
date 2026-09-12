import { CalendarPlus, CalendarRange } from "lucide-react";
import type { Session } from "next-auth";
import Link from "next/link";
import { DashboardHeader } from "@/src/components/dashboard/dashboard-header";
import { LiveMeetingHero } from "@/src/components/dashboard/live-meeting-hero";
import { TeacherRecentRecordings } from "@/src/components/dashboard/teacher/teacher-recent-recordings";
import { TeacherUpcomingList } from "@/src/components/dashboard/teacher/teacher-upcoming-list";
import { db } from "@/src/lib/db";
import { obtenerDashboardDocente } from "@/src/modules/dashboard/teacher-dashboard.adapter";

export async function TeacherDashboard({
  user
}: Readonly<{
  user: Session["user"];
}>) {
  const ahora = new Date();
  const data = await obtenerDashboardDocente(db, user.id, ahora);

  return (
    <div className="role-dashboard teacher-dashboard-redesigned" data-tour="teacher-dashboard">
      <DashboardHeader
        actions={
          <>
            <Link className="secondary-action" data-tour="teacher-agenda" href="/reuniones">
              <CalendarRange size={16} />
              <span>Ver mi agenda</span>
            </Link>
            <Link className="primary-action" data-tour="teacher-create" href="/reuniones/nueva">
              <CalendarPlus size={17} />
              <span>Nueva reunión</span>
            </Link>
          </>
        }
        role="DOCENTE"
        userName={user.name ?? "Docente"}
      />

      <LiveMeetingHero
        emptyStateActionHref="/reuniones/nueva"
        emptyStateActionLabel="Crear una reunión"
        emptyStateCopy="Consultá el cronograma de tus cursos o programá un nuevo encuentro virtual o híbrido."
        emptyStateTitle="No tenés clases programadas para hoy"
        meeting={data.heroMeeting}
        role="DOCENTE"
      />

      <div className="teacher-dashboard-columns">
        <TeacherUpcomingList meetings={data.upcomingMeetings} />
        <TeacherRecentRecordings recordings={data.recentRecordings} />
      </div>
    </div>
  );
}
