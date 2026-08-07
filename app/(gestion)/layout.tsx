import { redirect } from "next/navigation";
import { auth } from "@/auth";
import { AppShell } from "@/src/components/app-shell";
import { db } from "@/src/lib/db";
import { requiereCompletarRegistro } from "@/src/modules/usuarios/registro-institucional.domain";
import "./gestion.css";
import "./operations.css";
import "./settings.css";
import "./personal.css";
import "./assistant-month.css";
import "./assistant-dashboard.css";
import "./admin-assistants.css";

export default async function GestionLayout({
  children
}: Readonly<{ children: React.ReactNode }>) {
  const session = await auth();
  if (!session?.user) redirect("/acceso");
  const user = await db.usuario.findUnique({
    where: { id: session.user.id },
    select: {
      rol: true,
      docente: { select: { _count: { select: { programas: { where: { activo: true } } } } } }
    }
  });
  if (user && requiereCompletarRegistro({
    rol: user.rol,
    programasActivos: user.docente?._count.programas ?? 0
  })) {
    redirect("/completar-registro");
  }

  return <AppShell user={session.user}>{children}</AppShell>;
}
