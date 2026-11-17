"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { auth } from "@/auth";
import { resolveSessionActor } from "@/src/lib/auth/session-actor.adapter";
import { db } from "@/src/lib/db";
import { actualizarPerfilPersonal, cambiarPasswordPersonal } from "@/src/modules/usuarios/perfil.service";
import { tiposNotificacionPerfil } from "./preferencias";

async function actorActual() {
  const session = await auth();
  if (!session?.user) {
    redirect("/acceso");
  }
  const actor = await resolveSessionActor(db, { id: session.user.id, email: session.user.email });
  if (!actor?.activo) {
    redirect("/acceso");
  }
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
  redirect(`/mi-perfil?seccion=datos&estado=${estado}`);
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
  redirect(`/mi-perfil?seccion=acceso&estado=${estado}`);
}

export async function guardarPreferenciasNotificacion(formData: FormData): Promise<void> {
  const actor = await actorActual();
  let estado = "notificaciones-guardadas";
  try {
    await db.$transaction(async (tx) => {
      for (const tipo of tiposNotificacionPerfil(actor.rol)) {
        await tx.preferenciaNotificacion.upsert({
          where: { usuarioId_tipo: { usuarioId: actor.id, tipo } },
          create: {
            usuarioId: actor.id,
            tipo,
            push: formData.get(`${tipo}:push`) === "on",
            email: formData.get(`${tipo}:email`) === "on"
          },
          update: {
            push: formData.get(`${tipo}:push`) === "on",
            email: formData.get(`${tipo}:email`) === "on"
          }
        });
      }
    });
  } catch {
    estado = "error-notificaciones";
  }
  revalidatePath("/mi-perfil");
  redirect(`/mi-perfil?seccion=notificaciones&estado=${estado}`);
}
