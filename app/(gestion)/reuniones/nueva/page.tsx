import { redirect } from "next/navigation";
import { auth } from "@/auth";
import { MeetingForm } from "@/src/components/meeting-form";
import { resolveSessionActor } from "@/src/lib/auth/session-actor.adapter";
import { db } from "@/src/lib/db";
import { puedeAbrirCreacionReuniones } from "@/src/modules/reuniones/reuniones.domain";

export default async function NuevaReunionPage() {
  const session = await auth();
  if (!session?.user) redirect("/acceso");
  const actor = await resolveSessionActor(db, {
    id: session.user.id,
    email: session.user.email
  });
  if (!actor?.activo || !puedeAbrirCreacionReuniones(actor.rol)) {
    redirect("/reuniones");
  }

  const [associations, hosts, assistants, cohosts] = await Promise.all([
    db.docentePrograma.findMany({
      where: {
        activo: true,
        programa: { activo: true },
        ...(actor.rol === "DOCENTE"
          ? { docente: { usuarioId: actor.id } }
          : {})
      },
      orderBy: { programa: { nombre: "asc" } },
      include: { programa: true, docente: { include: { usuario: true } } }
    }),
    db.cuentaProveedor.findMany({
      where: { proveedor: { tipo: "GOOGLE_MEET" }, activa: true, tieneLicencia: true },
      orderBy: { prioridad: "asc" }
    }),
    db.asistente.findMany({
      where: { usuario: { activo: true } },
      orderBy: { usuario: { nombres: "asc" } },
      include: { usuario: true }
    }),
    db.cuentaGoogleFlacso.findMany({
      where: { user: { activo: true } },
      orderBy: { email: "asc" },
      select: { id: true, email: true }
    })
  ]);

  return (
    <>
      <header className="page-header">
        <div>
          <p className="page-eyebrow">Google Meet</p>
          <h1>Nueva reunión</h1>
          <p>Creá una o varias instancias para un programa.</p>
        </div>
      </header>
      <MeetingForm
        assistants={assistants.map(({ id, usuario }) => ({
          id,
          label: `${usuario.nombres} ${usuario.apellidos ?? ""}`.trim()
        }))}
        cohosts={cohosts}
        hosts={hosts.map(({ id, nombre, emailOrganizador }) => ({
          id,
          label: nombre,
          email: emailOrganizador ?? ""
        }))}
        programs={associations.map(({ id, docente, programa }) => ({
          id,
          label: programa.nombre,
          teacher: `${docente.usuario.nombres} ${docente.usuario.apellidos ?? ""}`.trim()
        }))}
      />
    </>
  );
}
