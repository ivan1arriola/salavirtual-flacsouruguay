import { ArrowLeft, UserRoundX } from "lucide-react";
import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { auth } from "@/auth";
import { GoogleAccountsForm } from "@/src/components/google-accounts-form";
import { TeacherProgramsForm } from "@/src/components/teacher-programs-form";
import { UserRoleForm } from "@/src/components/user-role-form";
import { db } from "@/src/lib/db";
import { cesarAsistenteUsuario, guardarProgramasUsuario } from "./actions";

const messages: Readonly<Record<string, string>> = {
  "programas-guardados": "Los programas del docente fueron actualizados.",
  "error-programas": "No se pudieron actualizar los programas del docente.",
  "asistente-cesado": "El asistente técnico quedó cesado hasta su próximo inicio de sesión.",
  "error-cese-asistente": "No se pudo cesar al asistente técnico."
};

export default async function UsuarioPage({
  params,
  searchParams
}: Readonly<{
  params: Promise<{ usuarioId: string }>;
  searchParams: Promise<{ estado?: string }>;
}>) {
  const session = await auth();
  if (session?.user.role !== "ADMINISTRACION") redirect("/");
  const { usuarioId } = await params;
  const [user, programs] = await Promise.all([
    db.usuario.findUnique({
      where: { id: usuarioId },
      include: {
        cuentasGoogle: { orderBy: { email: "asc" } },
        docente: { include: { programas: { where: { activo: true }, select: { programaId: true } } } },
        asistenteTecnico: { select: { cesadoHastaProximoInicioSesion: true } }
      }
    }),
    db.programa.findMany({
      where: { activo: true },
      orderBy: { nombre: "asc" },
      select: { id: true, nombre: true }
    })
  ]);
  if (!user) notFound();
  const { estado } = await searchParams;

  return (
    <>
      <Link className="back-link" href="/usuarios"><ArrowLeft size={16} />Usuarios</Link>
      <header className="page-header">
        <div><p className="page-eyebrow">{user.rol.toLowerCase()}</p><h1>{user.nombres} {user.apellidos}</h1><p>Usuario local: {user.id}</p></div>
      </header>
      {estado && messages[estado] ? <p className="form-notice" role="status">{messages[estado]}</p> : null}
      <div className="user-settings">
        <UserRoleForm userId={user.id} initialRole={user.rol} />
        <GoogleAccountsForm
          initialEmails={user.cuentasGoogle.map(({ email }) => email)}
          hasPassword={Boolean(user.passwordHash)}
          userId={user.id}
        />
        {user.rol === "ASISTENTE_TECNICO" && user.asistenteTecnico ? (
          <section className="form-section account-form">
            <div className="section-heading compact-heading">
              <div>
                <h2>Disponibilidad operativa</h2>
                <p>El cese temporal excluye a la persona de notificaciones, postulaciones y algoritmos de asignación hasta que vuelva a iniciar sesión.</p>
              </div>
            </div>
            <div>
              <span className={`status ${user.asistenteTecnico.cesadoHastaProximoInicioSesion ? "status-warning" : "status-ok"}`}>
                {user.asistenteTecnico.cesadoHastaProximoInicioSesion ? "Cesado hasta próximo inicio" : "Disponible para operar"}
              </span>
            </div>
            <form action={cesarAsistenteUsuario}>
              <input name="usuarioId" type="hidden" value={user.id} />
              <footer className="form-actions">
                <span className="muted-text">Las asignaciones existentes no se cancelan.</span>
                <button
                  className="secondary-action"
                  disabled={user.asistenteTecnico.cesadoHastaProximoInicioSesion}
                  type="submit"
                >
                  <UserRoundX size={17} />Cesar hasta próximo inicio de sesión
                </button>
              </footer>
            </form>
          </section>
        ) : null}
        {user.rol === "DOCENTE" ? (
          <TeacherProgramsForm
            programs={programs.map(({ id, nombre }) => ({ id, name: nombre }))}
            initialSelectedIds={user.docente?.programas.map(({ programaId }) => programaId) ?? []}
            saveAction={guardarProgramasUsuario}
            targetUserId={user.id}
            title="Programas del docente"
          />
        ) : null}
      </div>
    </>
  );
}
