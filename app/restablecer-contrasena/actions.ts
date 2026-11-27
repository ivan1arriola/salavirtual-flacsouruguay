"use server";

import { redirect } from "next/navigation";
import { z } from "zod";
import { db } from "@/src/lib/db";
import { restablecerPassword } from "@/src/modules/usuarios/recuperacion-password.service";

export async function guardarNuevaPassword(formData: FormData): Promise<void> {
  const token = String(formData.get("token") ?? "");
  let error: "datos" | "token" | null = null;

  try {
    await restablecerPassword(db, {
      token,
      passwordNueva: String(formData.get("passwordNueva") ?? ""),
      confirmarPassword: String(formData.get("confirmarPassword") ?? ""),
    });
  } catch (cause) {
    error = cause instanceof z.ZodError ? "datos" : "token";
  }

  if (!error) {
    redirect("/acceso?restablecida=1");
  }
  redirect(`/restablecer-contrasena?token=${encodeURIComponent(token)}&error=${error}`);
}
