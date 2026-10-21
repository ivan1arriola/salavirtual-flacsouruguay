import { redirect } from "next/navigation";
import { Suspense } from "react";
import { auth } from "@/auth";
import { AgendaDayEnhancer } from "@/src/components/agenda-day-enhancer";
import { AppShell } from "@/src/components/app-shell";
import { resolveSessionActor } from "@/src/lib/auth/session-actor.adapter";
import { db } from "@/src/lib/db";
import { requiereCompletarRegistro } from "@/src/modules/usuarios/registro-institucional.domain";
import "./gestion.css";
import "./operations.css";
import "./settings.css";
import "./configuration-center.css";
import "./program-admin.css";
import "./personal.css";
import "./assistant-month.css";
import "./assistant-dashboard.css";
import "./assistant-report-config.css";
import "./admin-assistants.css";
import "./role-dashboard.css";
import "./ux-polish.css";
import "./brand-refresh.css";
import "./profile-navigation-refresh.css";
import "./agenda-refresh.css";
import "./agenda-v2.css";
import "./agenda-day-zebra.css";
import "./assistant-agenda.css";
import "./meeting-form-v2.css";
import "./meeting-detail-v2.css";
import "./attendance-view.css";
import "./agenda-mobile-compact.css";
import "./admin-upcoming-refresh.css";
import "./admin-dashboard-mobile.css";
import "./monitoring-coverage-workflow.css";
import "./assistants-monitoring-mobile.css";

export default async function GestionLayout({
  children
}: Readonly<{ children: React.ReactNode }>) {
  const session = await auth();
  if (!session?.user) redirect("/acceso");
  const actor = await resolveSessionActor(db, {
    id: session.user.id,
    email: session.user.email
  });
  if (!actor?.activo) {
    // El JWT existe, pero ya no identifica una cuenta activa.
    console.warn("[Auth] Sesión rechazada en gestión: usuario inexistente o inactivo.");
    redirect("/acceso");
  }
  const user = await db.usuario.findUnique({
    where: { id: actor.id },
    select: {
      rol: true,
      nombres: true,
      apellidos: true,
      emailPrincipal: true,
      imagenUrl: true,
      docente: { select: { _count: { select: { programas: { where: { activo: true } } } } } }
    }
  });
  if (!user) redirect("/acceso");
  if (requiereCompletarRegistro({
    rol: user.rol,
    programasActivos: user.docente?._count.programas ?? 0
  })) {
    redirect("/completar-registro");
  }

  return (
    <AppShell user={{
      ...session.user,
      id: actor.id,
      role: actor.rol,
      name: [user.nombres, user.apellidos].filter(Boolean).join(" "),
      email: user.emailPrincipal ?? session.user.email,
      image: user.imagenUrl ?? session.user.image
    }}>
      <Suspense fallback={null}>
        <AgendaDayEnhancer />
      </Suspense>
      {children}
    </AppShell>
  );
}
