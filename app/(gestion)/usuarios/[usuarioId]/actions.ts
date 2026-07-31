"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { auth } from "@/auth";
import { resolveSessionActor } from "@/src/lib/auth/session-actor.adapter";
import { db } from "@/src/lib/db";
import { actualizarProgramasDocente } from "@/src/modules/usuarios/programas-docente.service";

export async function guardarProgramasUsuario(formData: FormData): Promise<void> {
  const session = await auth();
  if (!session?.user) redirect("/acceso");
  const actor = await resolveSessionActor(db, {
    id: session.user.id,
    email: session.user.email
  });
  if (!actor?.activo || actor.rol !== "ADMINISTRACION") redirect("/");

  const usuarioId = String(formData.get("usuarioId") ?? "");
  let estado = "programas-guardados";
  try {
    await actualizarProgramasDocente(db, actor, usuarioId, {
      programaIds: formData.getAll("programaIds")
    });
  } catch {
    estado = "error-programas";
  }

  revalidatePath(`/usuarios/${usuarioId}`);
  revalidatePath("/reuniones/nueva");
  redirect(`/usuarios/${encodeURIComponent(usuarioId)}?estado=${estado}`);
}
