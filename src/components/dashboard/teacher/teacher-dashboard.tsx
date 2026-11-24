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
            <Link className="secondary-action" data-tour="teacher-agenda" href="/mis-clases">
              <CalendarRange size={16} />
              <span>Mis clases</span>
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
        emptyStateTitle="No tenés próximas clases programadas"
        meeting={data.heroMeeting}
        role="DOCENTE"
      />

      <div className="role-dashboard-shortcuts" aria-label="Accesos académicos">
        <Link href="/mis-clases" className="role-dashboard-shortcut">
          <strong>{data.totalUpcomingCount}</strong>
          <span>Próximas clases</span>
        </Link>
        <Link href="/mis-programas" className="role-dashboard-shortcut">
          Mis programas
        </Link>
        <Link href="/mis-clases?vista=anteriores" className="role-dashboard-shortcut">
          Consultar asistencia
        </Link>
        <Link href="/grabaciones" className="role-dashboard-shortcut">
          Biblioteca de grabaciones
        </Link>
      </div>
      <div className="teacher-dashboard-columns">
        <TeacherUpcomingList meetings={data.upcomingMeetings} />
        <TeacherRecentRecordings recordings={data.recentRecordings} />
      </div>
    </div>
  );
}
