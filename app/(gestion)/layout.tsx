import { redirect } from "next/navigation";
import { auth } from "@/auth";

export default async function GestionLayout({
  children
}: Readonly<{ children: React.ReactNode }>) {
  const session = await auth();
  if (!session?.user) redirect("/acceso");

  return children;
}
