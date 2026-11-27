import { BookOpen } from "lucide-react";
import { redirect } from "next/navigation";
import { auth } from "@/auth";
import { TeacherProgramsForm } from "@/src/components/teacher-programs-form";
import { resolveSessionActor } from "@/src/lib/auth/session-actor.adapter";
import { db } from "@/src/lib/db";
import { puedeGestionarProgramasPropios } from "@/src/modules/usuarios/programas-docente.domain";
import { guardarProgramas } from "./actions";

const messages: Readonly<Record<string, string>> = {
  "programas-guardados": "Tus programas fueron actualizados.",
  "error-programas": "No se pudieron actualizar tus programas.",
};

export default async function MisProgramasPage({
  searchParams,
}: Readonly<{ searchParams: Promise<{ estado?: string }> }>) {
  const session = await auth();
  if (!session?.user) {
    redirect("/acceso");
  }
  const actor = await resolveSessionActor(db, {
    id: session.user.id,
    email: session.user.email,
  });
  if (!actor?.activo) {
    redirect("/acceso");
  }
  if (!puedeGestionarProgramasPropios(actor)) {
    redirect("/");
  }

  const [user, programs] = await Promise.all([
    db.usuario.findUnique({
      where: { id: actor.id },
      select: {
        docente: {
          select: {
            programas: {
              where: { activo: true },
              select: { programaId: true },
            },
          },
        },
      },
    }),
    db.programa.findMany({
      where: { activo: true },
      orderBy: { nombre: "asc" },
      select: { id: true, nombre: true },
    }),
  ]);
  if (!user) {
    redirect("/acceso");
  }
  const { estado } = await searchParams;

  return (
    <>
      <header className="page-header">
        <div>
          <p className="page-eyebrow">Actividad académica</p>
          <h1>Mis programas</h1>
          <p>Administrá los programas para los que podés crear reuniones.</p>
        </div>
        <BookOpen size={28} color="var(--brand)" aria-hidden="true" />
      </header>
      {estado && messages[estado] ? (
        <p className="form-notice" role="status">
          {messages[estado]}
        </p>
      ) : null}
      <TeacherProgramsForm
        programs={programs.map(({ id, nombre }) => ({ id, name: nombre }))}
        initialSelectedIds={user.docente?.programas.map(({ programaId }) => programaId) ?? []}
        saveAction={guardarProgramas}
        title="Programas asociados"
      />
    </>
  );
}
