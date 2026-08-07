"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { auth } from "@/auth";
import { resolveSessionActor } from "@/src/lib/auth/session-actor.adapter";
import { db } from "@/src/lib/db";
import { invitarUsuario } from "@/src/modules/usuarios/invitaciones.service";

export async function enviarInvitacion(formData: FormData): Promise<void> {
  const session = await auth();
  if (!session?.user) redirect("/acceso");
  const actor = await resolveSessionActor(db, { id: session.user.id, email: session.user.email });
  if (!actor) redirect("/acceso");
  let estado: "invitacion-enviada" | "invitacion-creada";
  try {
    const result = await invitarUsuario(db, actor, {
      nombres: formData.get("nombres"),
      apellidos: formData.get("apellidos"),
      email: formData.get("email"),
      rol: formData.get("rol"),
      programaId: formData.get("programaId"),
      programaNuevo: formData.get("programaNuevo")
    });
    estado = result.correoEnviado ? "invitacion-enviada" : "invitacion-creada";
  } catch (error) {
    const message = error instanceof Error ? error.message : "No se pudo crear la invitación.";
    redirect(`/usuarios?error=${encodeURIComponent(message)}`);
  }
  revalidatePath("/usuarios");
  redirect(`/usuarios?estado=${estado}`);
}
