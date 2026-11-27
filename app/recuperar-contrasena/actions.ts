"use server";

import { redirect } from "next/navigation";
import { db } from "@/src/lib/db";
import { solicitarRecuperacionPassword } from "@/src/modules/usuarios/recuperacion-password.service";

export async function solicitarRecuperacion(formData: FormData): Promise<void> {
  try {
    await solicitarRecuperacionPassword(db, {
      email: String(formData.get("email") ?? ""),
    });
  } catch (error) {
    // La respuesta debe ser indistinguible para correos registrados y no registrados.
    console.warn("No se pudo procesar una solicitud de recuperación de contraseña", error);
  }

  redirect("/recuperar-contrasena?enviado=1");
}
