import { ChevronRight, Users } from "lucide-react";
import Link from "next/link";
import { redirect } from "next/navigation";
import { auth } from "@/auth";
import { db } from "@/src/lib/db";

export default async function UsuariosPage() {
  const session = await auth();
  if (session?.user.role !== "ADMINISTRACION") redirect("/");
  const users = await db.usuario.findMany({
    orderBy: [{ apellidos: "asc" }, { nombres: "asc" }],
    include: {
      cuentasGoogle: { select: { email: true } },
      docente: { include: { programas: { where: { activo: true } } } }
    }
  });

  return (
    <>
      <header className="page-header">
        <div><p className="page-eyebrow">Administración</p><h1>Usuarios</h1><p>{users.length} identidades registradas.</p></div>
        <Users size={28} color="var(--brand)" />
      </header>
      <section className="content-section">
        <div className="table-wrap">
          <table className="data-table">
            <thead><tr><th>Usuario</th><th>Rol</th><th>Cuentas FLACSO</th><th>Acceso</th><th></th></tr></thead>
            <tbody>
              {users.map((user) => (
                <tr key={user.id}>
                  <td><strong>{user.nombres} {user.apellidos}</strong><small>{user.id} · {user.emailPrincipal ?? "sin email principal"}</small></td>
                  <td><span className="status status-neutral">{roleLabel(user.rol)}</span></td>
                  <td>{user.cuentasGoogle.length ? user.cuentasGoogle.map(({ email }) => email).join(", ") : <span className="muted-text">Sin cuenta</span>}</td>
                  <td><span className={`status status-${user.activo ? "ok" : "error"}`}>{user.activo ? "Activo" : "Inactivo"}</span></td>
                  <td><Link className="icon-link" href={`/usuarios/${encodeURIComponent(user.id)}`} title="Gestionar usuario"><ChevronRight size={18} /><span className="sr-only">Gestionar usuario</span></Link></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>
    </>
  );
}

function roleLabel(role: string): string {
  return role === "ADMINISTRACION" ? "Administración" : role === "ASISTENTE" ? "Asistente" : "Docente";
}
