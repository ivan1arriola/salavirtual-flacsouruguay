import { redirect } from "next/navigation";
import { auth } from "@/auth";
import { resolveSessionActor } from "@/src/lib/auth/session-actor.adapter";
import { db } from "@/src/lib/db";

/**
 * Cada página se protege sola: un layout no se vuelve a ejecutar al navegar entre hijas.
 * Además del rol del token, comprueba en la base que siga siendo un administrador activo.
 */
export async function requireAdminPage() {
  const session = await auth();
  if (!session?.user || session.user.role !== "ADMINISTRACION") {
    redirect("/");
  }
  const actor = await resolveSessionActor(db, { id: session.user.id, email: session.user.email });
  if (!actor?.activo || actor.rol !== "ADMINISTRACION") {
    redirect("/");
  }
  return session;
}
