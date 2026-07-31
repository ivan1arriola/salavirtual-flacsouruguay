import { ArrowLeft } from "lucide-react";
import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { auth } from "@/auth";
import { GoogleAccountsForm } from "@/src/components/google-accounts-form";
import { db } from "@/src/lib/db";

export default async function UsuarioPage({
  params
}: Readonly<{ params: Promise<{ usuarioId: string }> }>) {
  const session = await auth();
  if (session?.user.role !== "ADMINISTRACION") redirect("/");
  const { usuarioId } = await params;
  const user = await db.usuario.findUnique({
    where: { id: usuarioId },
    include: { cuentasGoogle: { orderBy: { email: "asc" } } }
  });
  if (!user) notFound();

  return (
    <>
      <Link className="back-link" href="/usuarios"><ArrowLeft size={16} />Usuarios</Link>
      <header className="page-header">
        <div><p className="page-eyebrow">{user.rol.toLowerCase()}</p><h1>{user.nombres} {user.apellidos}</h1><p>Usuario local: {user.id}</p></div>
      </header>
      <GoogleAccountsForm
        initialEmails={user.cuentasGoogle.map(({ email }) => email)}
        hasPassword={Boolean(user.passwordHash)}
        userId={user.id}
      />
    </>
  );
}
