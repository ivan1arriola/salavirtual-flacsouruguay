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
    redirect("/mi-agenda");
  }

  const [associations, assistants, cohosts] = await Promise.all([
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
    actor.rol === "ADMINISTRACION"
      ? db.asistente.findMany({
          where: { usuario: { activo: true, rol: "ASISTENTE" } },
          orderBy: { usuario: { nombres: "asc" } },
          include: { usuario: true }
        })
      : Promise.resolve([]),
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
        canAssignAssistant={actor.rol === "ADMINISTRACION"}
        assistants={assistants.map(({ id, usuario }) => ({
          id,
          label: `${usuario.nombres} ${usuario.apellidos ?? ""}`.trim()
        }))}
        cohosts={cohosts}
        programs={associations.map(({ id, docente, programa }) => ({
          id,
          label: programa.nombre,
          teacher: `${docente.usuario.nombres} ${docente.usuario.apellidos ?? ""}`.trim()
        }))}
      />
    </>
  );
}
