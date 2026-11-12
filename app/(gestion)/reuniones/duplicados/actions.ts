"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { auth } from "@/auth";
import { resolveSessionActor } from "@/src/lib/auth/session-actor.adapter";
import { db } from "@/src/lib/db";
import { revisarPosibleDuplicado } from "@/src/modules/reuniones/duplicados.service";

export async function guardarRevisionDuplicado(formData: FormData): Promise<void> {
  const session = await auth();
  if (!session?.user) {
    redirect("/acceso");
  }
  const actor = await resolveSessionActor(db, { id: session.user.id, email: session.user.email });
  if (!actor?.activo || actor.rol !== "ADMINISTRACION") {
    redirect("/reuniones");
  }

  let estado = "revision-guardada";
  try {
    await revisarPosibleDuplicado(db, actor, Object.fromEntries(formData));
  } catch {
    estado = "error-revision";
  }
  revalidatePath("/");
  revalidatePath("/reuniones");
  revalidatePath("/reuniones/duplicados");
  redirect(`/reuniones/duplicados?estado=${estado}`);
}
