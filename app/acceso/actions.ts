"use server";

import { AuthError } from "next-auth";
import { redirect } from "next/navigation";
import { signIn, signOut } from "@/auth";

export async function iniciarSesionLocal(formData: FormData): Promise<void> {
  try {
    await signIn("credentials", {
      usuario: formData.get("usuario"),
      password: formData.get("password"),
      redirectTo: "/"
    });
  } catch (error) {
    if (error instanceof AuthError) {
      redirect(`/acceso?error=${encodeURIComponent(error.type)}`);
    }
    throw error;
  }
}

export async function iniciarSesionGoogle(): Promise<void> {
  try {
    // Eliminar JWT antiguos/rechazados antes de iniciar una nueva sesión OAuth.
    // No modifica cuentas ni permisos; solo las cookies de este navegador.
    await signOut({ redirect: false });
    await signIn("google", { redirectTo: "/" });
  } catch (error) {
    if (error instanceof AuthError) {
      redirect(`/acceso?error=${encodeURIComponent(error.type)}`);
    }
    throw error;
  }
}

export async function iniciarSesionGoogleRecordada(formData: FormData): Promise<void> {
  const loginHint = String(formData.get("loginHint") ?? "").trim();

  try {
    // También limpiar sesiones previas al elegir una cuenta recordada.
    await signOut({ redirect: false });
    await signIn(
      "google",
      { redirectTo: "/" },
      loginHint ? { login_hint: loginHint } : undefined
    );
  } catch (error) {
    if (error instanceof AuthError) {
      redirect(`/acceso?error=${encodeURIComponent(error.type)}`);
    }
    throw error;
  }
}
