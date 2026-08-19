"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { auth } from "@/auth";
import { resolveSessionActor } from "@/src/lib/auth/session-actor.adapter";
import { db } from "@/src/lib/db";
import { invitarUsuario } from "@/src/modules/usuarios/invitaciones.service";
import { actualizarProgramasDocente } from "@/src/modules/usuarios/programas-docente.service";

export async function agregarIntegrantePrograma(formData: FormData): Promise<void> {
  const actor = await requireAdmin();
  const programaId = String(formData.get("programaId") ?? "");
  const usuarioId = String(formData.get("usuarioId") ?? "");

  try {
    if (!programaId || !usuarioId) throw new Error("Seleccioná una persona para agregar.");
    const programaIds = await programasActivosDelDocente(usuarioId);
    await actualizarProgramasDocente(db, actor, usuarioId, {
      programaIds: [...programaIds, programaId]
    });
  } catch (error) {
    redirect(programRedirect(programaId, undefined, errorMessage(error)));
  }

  revalidateProgramMembership(usuarioId);
  redirect(programRedirect(programaId, "integrante-agregado"));
}

export async function quitarIntegrantePrograma(formData: FormData): Promise<void> {
  const actor = await requireAdmin();
  const programaId = String(formData.get("programaId") ?? "");
  const usuarioId = String(formData.get("usuarioId") ?? "");

  try {
    if (!programaId || !usuarioId) throw new Error("La asociación seleccionada no es válida.");
    const programaIds = await programasActivosDelDocente(usuarioId);
    if (!programaIds.includes(programaId)) throw new Error("La persona ya no pertenece a este programa.");
    await actualizarProgramasDocente(db, actor, usuarioId, {
      programaIds: programaIds.filter((id) => id !== programaId)
    });
  } catch (error) {
    redirect(programRedirect(programaId, undefined, errorMessage(error)));
  }

  revalidateProgramMembership(usuarioId);
  redirect(programRedirect(programaId, "integrante-quitado"));
}

export async function invitarIntegrantePrograma(formData: FormData): Promise<void> {
  const actor = await requireAdmin();
  const programaId = String(formData.get("programaId") ?? "");
  let estado: "invitacion-enviada" | "invitacion-creada";

  try {
    const result = await invitarUsuario(db, actor, {
      nombres: formData.get("nombres"),
      apellidos: formData.get("apellidos"),
      email: formData.get("email"),
      rol: "DOCENTE",
      programaId,
      programaNuevo: null
    });
    estado = result.correoEnviado ? "invitacion-enviada" : "invitacion-creada";
  } catch (error) {
    redirect(programRedirect(programaId, undefined, errorMessage(error)));
  }

  revalidatePath("/configuracion");
  revalidatePath("/usuarios");
  revalidatePath("/reuniones/nueva");
  redirect(programRedirect(programaId, estado));
}

async function requireAdmin() {
  const session = await auth();
  if (!session?.user) redirect("/acceso");
  const actor = await resolveSessionActor(db, { id: session.user.id, email: session.user.email });
  if (!actor?.activo || actor.rol !== "ADMINISTRACION") redirect("/");
  return actor;
}

async function programasActivosDelDocente(usuarioId: string): Promise<string[]> {
  const user = await db.usuario.findUnique({
    where: { id: usuarioId },
    select: {
      rol: true,
      docente: {
        select: { programas: { where: { activo: true }, select: { programaId: true } } }
      }
    }
  });
  if (!user || user.rol !== "DOCENTE") throw new Error("La persona seleccionada no es docente.");
  return user.docente?.programas.map(({ programaId }) => programaId) ?? [];
}

function revalidateProgramMembership(usuarioId: string): void {
  revalidatePath("/configuracion");
  revalidatePath("/usuarios");
  revalidatePath(`/usuarios/${usuarioId}`);
  revalidatePath("/reuniones/nueva");
}

function programRedirect(programaId: string, estado?: string, error?: string): string {
  const params = new URLSearchParams({ seccion: "programas" });
  if (programaId) params.set("programa", programaId);
  if (estado) params.set("estado", estado);
  if (error) params.set("error", error);
  return `/configuracion?${params.toString()}`;
}

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : "No se pudo actualizar el programa.";
}
