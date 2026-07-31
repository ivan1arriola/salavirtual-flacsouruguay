"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { auth } from "@/auth";
import { resolveSessionActor } from "@/src/lib/auth/session-actor.adapter";
import { db } from "@/src/lib/db";
import {
  actualizarPerfilPersonal,
  cambiarPasswordPersonal
} from "@/src/modules/usuarios/perfil.service";

async function actorActual() {
  const session = await auth();
  if (!session?.user) redirect("/acceso");
  const actor = await resolveSessionActor(db, { id: session.user.id, email: session.user.email });
  if (!actor?.activo) redirect("/acceso");
  return actor;
}

export async function guardarPerfil(formData: FormData): Promise<void> {
  const actor = await actorActual();
  let estado = "perfil-guardado";
  try {
    await actualizarPerfilPersonal(db, actor, Object.fromEntries(formData));
  } catch {
    estado = "error-perfil";
  }
  revalidatePath("/mi-perfil");
  redirect(`/mi-perfil?estado=${estado}`);
}

export async function guardarPassword(formData: FormData): Promise<void> {
  const actor = await actorActual();
  let estado = "password-guardada";
  try {
    await cambiarPasswordPersonal(db, actor, Object.fromEntries(formData));
  } catch {
    estado = "error-password";
  }
  revalidatePath("/mi-perfil");
  redirect(`/mi-perfil?estado=${estado}`);
}
