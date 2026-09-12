import { redirect } from "next/navigation";
import { auth } from "@/auth";
import { AdminDashboard } from "@/src/components/dashboard/admin/admin-dashboard";
import { AssistantDashboard } from "@/src/components/dashboard/assistant/assistant-dashboard";
import { TeacherDashboard } from "@/src/components/dashboard/teacher/teacher-dashboard";

export default async function HomePage() {
  const session = await auth();
  if (!session?.user) redirect("/acceso");

  if (session.user.role === "ASISTENTE_TECNICO") {
    return <AssistantDashboard user={session.user} />;
  }

  if (session.user.role === "DOCENTE") {
    return <TeacherDashboard user={session.user} />;
  }

  return <AdminDashboard user={session.user} />;
}
