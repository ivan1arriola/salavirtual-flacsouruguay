import { redirect } from "next/navigation";
import { auth } from "@/auth";
import { AppShell } from "@/src/components/app-shell";
import { resolveSessionActor } from "@/src/lib/auth/session-actor.adapter";
import { db } from "@/src/lib/db";
import { requiereCompletarRegistro } from "@/src/modules/usuarios/registro-institucional.domain";
import "./gestion.css";
import "./operations.css";
import "./settings.css";
import "./personal.css";
import "./assistant-month.css";
import "./assistant-dashboard.css";
import "./admin-assistants.css";
import "./role-dashboard.css";
import "./ux-polish.css";

export default async function GestionLayout({
  children
}: Readonly<{ children: React.ReactNode }>) {
  const session = await auth();
  if (!session?.user) redirect("/acceso");
  const actor = await resolveSessionActor(db, {
    id: session.user.id,
    email: session.user.email
  });
  if (!actor?.activo) redirect("/acceso");
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
      {children}
    </AppShell>
  );
}
