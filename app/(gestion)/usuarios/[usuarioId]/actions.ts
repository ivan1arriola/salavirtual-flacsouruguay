"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { auth } from "@/auth";
import { resolveSessionActor } from "@/src/lib/auth/session-actor.adapter";
import { db } from "@/src/lib/db";
import { eliminarUsuarioCompleto } from "@/src/modules/usuarios/eliminacion.service";
import { actualizarProgramasDocente } from "@/src/modules/usuarios/programas-docente.service";
import { cesarAsistenteTecnicoHastaProximoInicioSesion } from "@/src/modules/usuarios/estado-asistente.service";

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

export async function cesarAsistenteUsuario(formData: FormData): Promise<void> {
  const session = await auth();
  if (!session?.user) redirect("/acceso");
  const actor = await resolveSessionActor(db, {
    id: session.user.id,
    email: session.user.email
  });
  if (!actor?.activo || actor.rol !== "ADMINISTRACION") redirect("/");

  const usuarioId = String(formData.get("usuarioId") ?? "");
  let estado = "asistente-cesado";
  try {
    await cesarAsistenteTecnicoHastaProximoInicioSesion(db, actor, usuarioId);
  } catch {
    estado = "error-cese-asistente";
  }

  revalidatePath(`/usuarios/${usuarioId}`);
  revalidatePath("/usuarios");
  revalidatePath("/agenda-abierta");
  revalidatePath("/asistencia-tecnica");
  revalidatePath("/monitoreo");
  revalidatePath("/reuniones/nueva");
  redirect(`/usuarios/${encodeURIComponent(usuarioId)}?estado=${estado}`);
}

export async function eliminarUsuario(formData: FormData): Promise<void> {
  const session = await auth();
  if (!session?.user) redirect("/acceso");
  const actor = await resolveSessionActor(db, {
    id: session.user.id,
    email: session.user.email
  });
  if (!actor?.activo || actor.rol !== "ADMINISTRACION") redirect("/");

  const usuarioId = String(formData.get("usuarioId") ?? "");
  const confirmacion = String(formData.get("confirmacion") ?? "");

  try {
    await eliminarUsuarioCompleto(db, actor, usuarioId, confirmacion);
  } catch (error) {
    const message = error instanceof Error ? error.message : "No se pudo eliminar el usuario.";
    redirect(`/usuarios/${encodeURIComponent(usuarioId)}?estado=error-eliminar&error=${encodeURIComponent(message)}`);
  }

  revalidatePath("/usuarios");
  revalidatePath("/reuniones");
  revalidatePath("/agenda-abierta");
  revalidatePath("/asistencia-tecnica");
  revalidatePath("/monitoreo");
  revalidatePath("/reuniones/nueva");
  redirect("/usuarios?estado=usuario-eliminado");
}
