import { redirect } from "next/navigation";
import { auth } from "@/auth";

/** Cada página se protege sola: un layout no se vuelve a ejecutar al navegar entre hijas. */
export async function requireAdminPage() {
  const session = await auth();
  if (session?.user?.role !== "ADMINISTRACION") {
    redirect("/");
  }
  return session;
}
