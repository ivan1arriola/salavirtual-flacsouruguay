import { ArrowLeft, SlidersHorizontal, Trash2, UserRoundX } from "lucide-react";
import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { auth } from "@/auth";
import { GoogleAccountsForm } from "@/src/components/google-accounts-form";
import { TeacherProgramsForm } from "@/src/components/teacher-programs-form";
import { UserRoleForm } from "@/src/components/user-role-form";
import { db } from "@/src/lib/db";
import { cesarAsistenteUsuario, eliminarUsuario, guardarProgramasUsuario } from "./actions";

const messages: Readonly<Record<string, string>> = {
  "programas-guardados": "Los programas del docente fueron actualizados.",
  "error-programas": "No se pudieron actualizar los programas del docente.",
  "asistente-cesado": "El asistente técnico quedó cesado hasta su próximo inicio de sesión.",
  "error-cese-asistente": "No se pudo cesar al asistente técnico.",
  "error-eliminar": "No se pudo eliminar el usuario."
};

export default async function UsuarioPage({
  params,
  searchParams
}: Readonly<{
  params: Promise<{ usuarioId: string }>;
  searchParams: Promise<{ estado?: string; error?: string }>;
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
        asistenteTecnico: { select: { slug: true, disponibleGeneral: true, cesadoHastaProximoInicioSesion: true } }
      }
    }),
    db.programa.findMany({
      where: { activo: true },
      orderBy: { nombre: "asc" },
      select: { id: true, nombre: true }
    })
  ]);
  if (!user) notFound();
  const { estado, error } = await searchParams;
  const isSelf = session.user.id === user.id;
  const googleEmails = user.cuentasGoogle.map(({ email }) => email);
  const principalGoogle = user.emailPrincipal
    ? googleEmails.find((email) => email.toLowerCase() === user.emailPrincipal?.toLowerCase())
    : undefined;
  const orderedGoogleEmails = principalGoogle
    ? [principalGoogle, ...googleEmails.filter((email) => email !== principalGoogle)]
    : googleEmails;

  return (
    <>
      <Link className="back-link" href="/usuarios"><ArrowLeft size={16} />Usuarios</Link>
      <header className="page-header">
        <div><p className="page-eyebrow">{user.rol.toLowerCase()}</p><h1>{user.nombres} {user.apellidos}</h1><p>Usuario local: {user.id}</p></div>
      </header>
      {estado && messages[estado] ? (
        <p className={`form-notice ${estado === "error-eliminar" ? "form-notice-error" : ""}`} role="status">
          {estado === "error-eliminar" && error ? error : messages[estado]}
        </p>
      ) : null}
      <div className="user-settings">
        <UserRoleForm userId={user.id} initialRole={user.rol} />
        <GoogleAccountsForm
          initialEmails={orderedGoogleEmails}
          initialEmailPrincipal={user.emailPrincipal}
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
            <div className="assistant-user-statuses">
              <span className={`status ${user.asistenteTecnico.cesadoHastaProximoInicioSesion ? "status-warning" : "status-ok"}`}>
                {user.asistenteTecnico.cesadoHastaProximoInicioSesion ? "Cesado hasta próximo inicio" : "Sin cese temporal"}
              </span>
              <span className={`status ${user.asistenteTecnico.disponibleGeneral ? "status-ok" : "status-warning"}`}>
                {user.asistenteTecnico.disponibleGeneral ? "Recibe asignaciones" : "Asignaciones pausadas"}
              </span>
            </div>
            <form action={cesarAsistenteUsuario}>
              <input name="usuarioId" type="hidden" value={user.id} />
              <footer className="form-actions">
                <Link
                  className="secondary-action"
                  href={`/asistentes/${encodeURIComponent(user.asistenteTecnico.slug)}`}
                >
                  <SlidersHorizontal size={17} />Control operativo
                </Link>
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

        <section
          className="form-section account-form"
          style={{ borderColor: "#d8a0a0", background: "#fffafa" }}
        >
          <div className="section-heading compact-heading">
            <div>
              <h2 style={{ color: "#9f2f2f" }}>Zona de peligro</h2>
              <p>
                Elimina permanentemente la identidad y sus datos asociados: cuentas Google, sesiones, programas,
                solicitudes y reuniones propias, asignaciones o liquidaciones de asistencia técnica y demás relaciones.
                Esta operación no se puede deshacer.
              </p>
            </div>
          </div>
          {isSelf ? (
            <p className="form-notice form-notice-error">No podés eliminar la cuenta con la que estás administrando el sistema.</p>
          ) : (
            <form action={eliminarUsuario}>
              <input name="usuarioId" type="hidden" value={user.id} />
              <label className="field">
                <span>Escribí ELIMINAR para confirmar</span>
                <input
                  autoComplete="off"
                  name="confirmacion"
                  pattern="ELIMINAR"
                  placeholder="ELIMINAR"
                  required
                />
              </label>
              <footer className="form-actions">
                <span className="muted-text">
                  Se conservará únicamente una entrada técnica de auditoría sin nombre ni correo de la persona eliminada.
                </span>
                <button
                  className="secondary-action"
                  style={{ borderColor: "#b42318", background: "#b42318", color: "#ffffff" }}
                  type="submit"
                >
                  <Trash2 size={17} />Eliminar usuario y sus datos
                </button>
              </footer>
            </form>
          )}
        </section>
      </div>
    </>
  );
}
