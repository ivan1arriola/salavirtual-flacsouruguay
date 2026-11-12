import { redirect } from "next/navigation";
import { auth } from "@/auth";

export default async function HistoricoPage() {
  const session = await auth();
  if (!session?.user) {
    redirect("/acceso");
  }
  if (session.user.role !== "ADMINISTRACION") {
    redirect("/");
  }

  redirect("/configuracion?seccion=historico");
}
