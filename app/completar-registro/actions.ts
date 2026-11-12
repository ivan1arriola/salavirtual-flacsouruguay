"use server";

import { redirect } from "next/navigation";
import { auth } from "@/auth";
import { resolveSessionActor } from "@/src/lib/auth/session-actor.adapter";
import { db } from "@/src/lib/db";
import { completarRegistroInstitucional } from "@/src/modules/usuarios/registro-institucional.service";

export async function guardarRegistroInstitucional(formData: FormData): Promise<void> {
  const session = await auth();
  if (!session?.user) {
    redirect("/acceso");
  }
  const actor = await resolveSessionActor(db, { id: session.user.id, email: session.user.email });
  if (!actor) {
    redirect("/acceso");
  }
  try {
    await completarRegistroInstitucional(db, actor, {
      programaId: formData.get("programaId"),
      programaNuevo: formData.get("programaNuevo")
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "No se pudo completar el registro.";
    redirect(`/completar-registro?error=${encodeURIComponent(message)}`);
  }
  redirect("/");
}
