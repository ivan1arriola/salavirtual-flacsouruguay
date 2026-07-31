"use server";

import { AuthError } from "next-auth";
import { redirect } from "next/navigation";
import { signIn } from "@/auth";

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
    await signIn("google", { redirectTo: "/" });
  } catch (error) {
    if (error instanceof AuthError) {
      redirect(`/acceso?error=${encodeURIComponent(error.type)}`);
    }
    throw error;
  }
}
