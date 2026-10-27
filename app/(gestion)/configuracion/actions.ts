"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { auth } from "@/auth";
import { resolveSessionActor } from "@/src/lib/auth/session-actor.adapter";
import { db } from "@/src/lib/db";
import { actualizarConfiguracionAsistenciaTecnica } from "@/src/modules/configuracion/asistencia-tecnica.service";
import { actualizarConfiguracionCorreoSes } from "@/src/modules/configuracion/correo-ses.service";
import { cifrarConfiguracion, descifrarConfiguracion } from "@/src/lib/config/encryption";
import {
  actualizarConfiguracionZoom,
  actualizarSalaZoom,
  importarSalasZoom,
  obtenerCredencialZoom,
  probarConexionZoom
} from "@/src/modules/configuracion/zoom.service";
import {
  actualizarPrograma,
  crearPrograma,
  eliminarPrograma
} from "@/src/modules/programas/programas-admin.service";
import { invitarUsuario } from "@/src/modules/usuarios/invitaciones.service";
import { actualizarProgramasDocente } from "@/src/modules/usuarios/programas-docente.service";

export async function crearProgramaAdmin(formData: FormData): Promise<void> {
  const actor = await requireAdmin();
  const context = programReturnContext(formData);
  let programaId = "";
  try {
    programaId = await crearPrograma(db, actor, programaInput(formData));
  } catch (error) {
    redirect(programRedirect("", undefined, errorMessage(error), context));
  }

  revalidatePrograms();
  redirect(programRedirect(programaId, "programa-creado", undefined, context));
}

export async function actualizarProgramaAdmin(formData: FormData): Promise<void> {
  const actor = await requireAdmin();
  const context = programReturnContext(formData);
  const programaId = String(formData.get("programaId") ?? "");
  try {
    if (!programaId) throw new Error("Programa no válido.");
    await actualizarPrograma(db, actor, programaId, programaInput(formData));
  } catch (error) {
    redirect(programRedirect(programaId, undefined, errorMessage(error), context));
  }

  revalidatePrograms();
  redirect(programRedirect(programaId, "programa-actualizado", undefined, context));
}

export async function eliminarProgramaAdmin(formData: FormData): Promise<void> {
  const actor = await requireAdmin();
  const context = programReturnContext(formData);
  const programaId = String(formData.get("programaId") ?? "");
  const confirmacion = String(formData.get("confirmacion") ?? "");
  try {
    if (!programaId) throw new Error("Programa no válido.");
    await eliminarPrograma(db, actor, programaId, confirmacion);
  } catch (error) {
    redirect(programRedirect(programaId, undefined, errorMessage(error), context));
  }

  revalidatePrograms();
  redirect(programRedirect("", "programa-eliminado", undefined, context));
}

export async function agregarIntegrantePrograma(formData: FormData): Promise<void> {
  const actor = await requireAdmin();
  const context = programReturnContext(formData);
  const programaId = String(formData.get("programaId") ?? "");
  const usuarioId = String(formData.get("usuarioId") ?? "");

  try {
    if (!programaId || !usuarioId) throw new Error("Seleccioná una persona para agregar.");
    const programaIds = await programasActivosDelDocente(usuarioId);
    await actualizarProgramasDocente(db, actor, usuarioId, {
      programaIds: [...programaIds, programaId]
    });
  } catch (error) {
    redirect(programRedirect(programaId, undefined, errorMessage(error), context));
  }

  revalidateProgramMembership(usuarioId);
  redirect(programRedirect(programaId, "integrante-agregado", undefined, context));
}

export async function quitarIntegrantePrograma(formData: FormData): Promise<void> {
  const actor = await requireAdmin();
  const context = programReturnContext(formData);
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
    redirect(programRedirect(programaId, undefined, errorMessage(error), context));
  }

  revalidateProgramMembership(usuarioId);
  redirect(programRedirect(programaId, "integrante-quitado", undefined, context));
}

export async function invitarIntegrantePrograma(formData: FormData): Promise<void> {
  const actor = await requireAdmin();
  const context = programReturnContext(formData);
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
    redirect(programRedirect(programaId, undefined, errorMessage(error), context));
  }

  revalidatePath("/configuracion");
  revalidatePath("/usuarios");
  revalidatePath("/reuniones/nueva");
  redirect(programRedirect(programaId, estado, undefined, context));
}

export async function actualizarReportesAsistenciaAdmin(formData: FormData): Promise<void> {
  const actor = await requireAdmin();
  try {
    await actualizarConfiguracionAsistenciaTecnica(db, actor, {
      correosCopiaReporteMensual: formData.get("correosCopiaReporteMensual")
    });
  } catch (error) {
    redirect(asistenciaRedirect(
      undefined,
      errorMessage(error, "No se pudo actualizar la configuración de asistencia técnica.")
    ));
  }

  revalidatePath("/configuracion");
  redirect(asistenciaRedirect("reportes-asistencia-actualizados"));
}

export async function actualizarCorreoSesAdmin(formData: FormData): Promise<void> {
  const actor = await requireAdmin();
  try {
    await actualizarConfiguracionCorreoSes(db, actor, {
      activa: formData.get("activa") === "on",
      awsRegion: formData.get("awsRegion"),
      fromEmail: formData.get("fromEmail"),
      replyToEmail: formData.get("replyToEmail")
    });
  } catch (error) {
    redirect(`/configuracion?seccion=correo&error=${encodeURIComponent(errorMessage(error, "No se pudo guardar la configuración de Amazon SES."))}`);
  }
  revalidatePath("/configuracion");
  redirect("/configuracion?seccion=correo&estado=correo-ses-actualizado");
}

export async function actualizarZoomAdmin(formData: FormData): Promise<void> {
  const actor = await requireAdmin();
  try {
    await actualizarConfiguracionZoom({ db, cifrar: cifrarConfiguracion }, actor, {
      accountId: formData.get("accountId"),
      clientId: formData.get("clientId"),
      clientSecret: formData.get("clientSecret") || undefined,
      activa: formData.get("activa") === "on"
    });
  } catch (error) {
    redirect(zoomRedirect(undefined, errorMessage(error, "No se pudo guardar la configuración de Zoom.")));
  }
  revalidatePath("/configuracion");
  redirect(zoomRedirect("zoom-actualizado"));
}

export async function importarSalasZoomAdmin(): Promise<void> {
  const actor = await requireAdmin();
  let estado = "";
  try {
    const credentials = await obtenerCredencialZoom(db, descifrarConfiguracion);
    if (!credentials) throw new Error("Guardá y activá las credenciales de Zoom antes de importar salas.");
    const prueba = await probarConexionZoom(credentials);
    if (!prueba.ok) throw new Error(prueba.error ?? "Zoom rechazó la conexión.");
    if (prueba.usuariosConLicencia.length === 0) {
      throw new Error("La cuenta de Zoom no tiene usuarios con licencia para alojar reuniones.");
    }
    const resultado = await importarSalasZoom(db, actor, prueba.usuariosConLicencia);
    estado = `salas-zoom-importadas-${resultado.creadas}-${resultado.actualizadas}`;
  } catch (error) {
    redirect(zoomRedirect(undefined, errorMessage(error, "No se pudieron importar las salas Zoom.")));
  }
  revalidatePath("/configuracion");
  revalidatePath("/reuniones/nueva");
  redirect(zoomRedirect(estado));
}

export async function actualizarSalaZoomAdmin(formData: FormData): Promise<void> {
  const actor = await requireAdmin();
  try {
    const prioridad = Number(formData.get("prioridad"));
    await actualizarSalaZoom(db, actor, {
      id: String(formData.get("id") ?? ""),
      activa: formData.get("activa") === "on",
      ...(Number.isFinite(prioridad) && prioridad > 0 ? { prioridad } : {})
    });
  } catch (error) {
    redirect(zoomRedirect(undefined, errorMessage(error, "No se pudo actualizar la sala Zoom.")));
  }
  revalidatePath("/configuracion");
  revalidatePath("/reuniones/nueva");
  redirect(zoomRedirect("sala-zoom-actualizada"));
}

function zoomRedirect(estado?: string, error?: string): string {
  const params = new URLSearchParams({ seccion: "zoom" });
  if (estado) params.set("estado", estado);
  if (error) params.set("error", error);
  return `/configuracion?${params.toString()}`;
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

function programaInput(formData: FormData) {
  const unidadAcademicaId = formData.get("unidadAcademicaId");
  return {
    nombre: formData.get("nombre"),
    codigo: formData.get("codigo"),
    ...(unidadAcademicaId === null ? {} : { unidadAcademicaId }),
    activo: formData.get("activo") === "on"
  };
}

function revalidatePrograms(): void {
  revalidatePath("/configuracion");
  revalidatePath("/mis-programas");
  revalidatePath("/usuarios");
  revalidatePath("/reuniones/nueva");
}

function revalidateProgramMembership(usuarioId: string): void {
  revalidatePrograms();
  revalidatePath(`/usuarios/${usuarioId}`);
}

type ProgramReturnContext = "configuracion" | "usuarios";

function programReturnContext(formData: FormData): ProgramReturnContext {
  return formData.get("contexto") === "usuarios" ? "usuarios" : "configuracion";
}

function programRedirect(programaId: string, estado?: string, error?: string, context: ProgramReturnContext = "configuracion"): string {
  const params = context === "usuarios"
    ? new URLSearchParams({ vista: "programas" })
    : new URLSearchParams({ seccion: "programas" });
  if (programaId) params.set("programa", programaId);
  if (estado) params.set("estado", estado);
  if (error) params.set("error", error);
  return `${context === "usuarios" ? "/usuarios" : "/configuracion"}?${params.toString()}`;
}

function asistenciaRedirect(estado?: string, error?: string): string {
  const params = new URLSearchParams({ seccion: "asistencia" });
  if (estado) params.set("estado", estado);
  if (error) params.set("error", error);
  return `/configuracion?${params.toString()}`;
}

function errorMessage(error: unknown, fallback = "No se pudo actualizar el programa."): string {
  return error instanceof Error ? error.message : fallback;
}
