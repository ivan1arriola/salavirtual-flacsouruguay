"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { auth } from "@/auth";
import { resolveSessionActor } from "@/src/lib/auth/session-actor.adapter";
import { db } from "@/src/lib/db";
import { invitarUsuario } from "@/src/modules/usuarios/invitaciones.service";
import {
  aprobarSolicitudAccesoGoogle as aprobarSolicitud,
  rechazarSolicitudAccesoGoogle as rechazarSolicitud
} from "@/src/modules/usuarios/solicitudes-acceso-google.service";
import { esRolUsuario } from "@/src/modules/usuarios/roles";

export async function enviarInvitacion(formData: FormData): Promise<void> {
  const session = await auth();
  if (!session?.user) {
    redirect("/acceso");
  }
  const actor = await resolveSessionActor(db, { id: session.user.id, email: session.user.email });
  if (!actor) {
    redirect("/acceso");
  }
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

export async function aprobarSolicitudAccesoGoogle(formData: FormData): Promise<void> {
  const session = await auth();
  if (!session?.user) {
    redirect("/acceso");
  }
  const actor = await resolveSessionActor(db, { id: session.user.id, email: session.user.email });
  const solicitudId = String(formData.get("solicitudId") ?? "");
  const rol = String(formData.get("rol") ?? "");
  try {
    if (!actor || !esRolUsuario(rol)) {
      throw new Error("Datos de aprobación inválidos.");
    }
    await aprobarSolicitud(db, actor, solicitudId, rol);
  } catch (error) {
    const message = error instanceof Error ? error.message : "No se pudo aprobar la solicitud.";
    redirect(`/usuarios?error=${encodeURIComponent(message)}`);
  }
  revalidatePath("/usuarios");
  redirect("/usuarios?estado=solicitud-aprobada");
}

export async function rechazarSolicitudAccesoGoogle(formData: FormData): Promise<void> {
  const session = await auth();
  if (!session?.user) {
    redirect("/acceso");
  }
  const actor = await resolveSessionActor(db, { id: session.user.id, email: session.user.email });
  const solicitudId = String(formData.get("solicitudId") ?? "");
  try {
    if (!actor || !solicitudId) {
      throw new Error("Datos de rechazo inválidos.");
    }
    await rechazarSolicitud(db, actor, solicitudId);
  } catch (error) {
    const message = error instanceof Error ? error.message : "No se pudo rechazar la solicitud.";
    redirect(`/usuarios?error=${encodeURIComponent(message)}`);
  }
  revalidatePath("/usuarios");
  redirect("/usuarios?estado=solicitud-rechazada");
}
