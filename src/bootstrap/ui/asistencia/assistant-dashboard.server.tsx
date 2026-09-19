import type { Session } from "next-auth";
import { redirect } from "next/navigation";
import { resolveSessionActor } from "@/src/lib/auth/session-actor.adapter";
import { db } from "@/src/lib/db";
import { AssistantDashboardView } from "@/src/modules/asistencia/presentation/components/assistant-dashboard";
import { obtenerDashboardAsistenteOptimizado } from "@/src/modules/dashboard/assistant-dashboard.adapter";

export async function AssistantDashboard({
  user
}: Readonly<{
  user: Session["user"];
}>) {
  const actor = await resolveSessionActor(db, { id: user.id, email: user.email });
  if (!actor?.activo || actor.rol !== "ASISTENTE_TECNICO") redirect("/");

  const data = await obtenerDashboardAsistenteOptimizado(db, actor.id, new Date());
  if (!data) redirect("/mi-perfil");

  return <AssistantDashboardView data={data} userName={user.name ?? "Asistente"} />;
}
