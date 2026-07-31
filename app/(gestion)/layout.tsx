import { redirect } from "next/navigation";
import { auth } from "@/auth";
import { AppShell } from "@/src/components/app-shell";
import "./gestion.css";
import "./operations.css";
import "./settings.css";
import "./personal.css";
import "./assistant-month.css";
import "./assistant-dashboard.css";

export default async function GestionLayout({
  children
}: Readonly<{ children: React.ReactNode }>) {
  const session = await auth();
  if (!session?.user) redirect("/acceso");

  return <AppShell user={session.user}>{children}</AppShell>;
}
